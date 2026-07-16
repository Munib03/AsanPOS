import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AiAssistantStreamPart } from '../../shared/types/ai-assistant.types';
import { AiAssistantGraphSchema, type AiAssistantGraph } from './ai-assistant.response.schema';

interface StreamAiAssistantResponseParams {
  result: {
    threadId: string;
    userMessageId: string;
    fullStream: AsyncIterable<AiAssistantStreamPart>;
  };
  saveAssistantMessage: (threadId: string, content: string) => Promise<{ id: string }>;
  saveFailedAssistantMessage: (threadId: string, content: string, error: unknown) => Promise<void>;
}

export function streamAiAssistantResponse({
  result,
  saveAssistantMessage,
  saveFailedAssistantMessage,
}: StreamAiAssistantResponseParams): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    let closed = false;
    let draft = '';
    const emit = (type: string, data: Record<string, unknown>) => {
      if (!closed) subscriber.next({ type, data });
    };

    void (async () => {
      try {
        for await (const part of result.fullStream) {
          if (closed) return;
          if (part.type === 'tool-call') {
            emit('tool', { name: part.toolName, status: 'started' });
            continue;
          }
          if (part.type === 'tool-result') {
            emit('tool', { name: part.toolName, status: 'completed' });
            const graph = part.toolName === 'createBusinessGraph' ? getVerifiedGraph(part.output) : null;
            if (graph) {
              emit('graph', graph);
            }
            continue;
          }
          if (part.type === 'tool-error') {
            emit('tool', {
              name: part.toolName,
              status: 'failed',
              message: part.error instanceof Error ? part.error.message : 'Tool execution failed.',
            });
            continue;
          }
          if (part.type !== 'text-delta' || !part.text) continue;
          const contentChunk = draft ? part.text : part.text.trimStart();
          if (!contentChunk) continue;
          draft += contentChunk;
          emit('chunk', { content: contentChunk });
        }

        draft = draft.trim();
        if (!draft) throw new Error('The assistant returned an empty response.');
        const assistantMessage = await saveAssistantMessage(result.threadId, draft);
        emit('done', {
          content: draft,
          threadId: result.threadId,
          userMessageId: result.userMessageId,
          assistantMessageId: assistantMessage.id,
        });
        if (!closed) subscriber.complete();
      } catch (error) {
        try {
          await saveFailedAssistantMessage(result.threadId, draft, error);
        } catch {}
        emit('error', {
          threadId: result.threadId,
          userMessageId: result.userMessageId,
          message: error instanceof Error ? error.message : 'Failed to stream assistant response.',
        });
        if (!closed) subscriber.complete();
      }
    })();

    return () => {
      closed = true;
    };
  });
}

function getVerifiedGraph(output: unknown): AiAssistantGraph | null {
  if (!output || typeof output !== 'object' || !('graph' in output)) return null;

  const parsedGraph = AiAssistantGraphSchema.safeParse(output.graph);
  return parsedGraph.success ? parsedGraph.data : null;
}
