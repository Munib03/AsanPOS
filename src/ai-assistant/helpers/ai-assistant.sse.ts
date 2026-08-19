import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AiAssistantStreamPart } from '../../shared/types/ai-assistant.types';
import {
  AiAssistantGraphSchema,
  type AiAssistantGraph,
  AiAssistantPdfSchema,
  type AiAssistantPdf,
} from './ai-assistant.response.schema';

interface AiAssistantPdfAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  signedUrl: string;
}

interface StreamAiAssistantResponseParams {
  result: {
    threadId: string;
    userMessageId: string;
    fullStream: AsyncIterable<AiAssistantStreamPart>;
  };
  saveAssistantMessage: (
    threadId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ) => Promise<{ id: string }>;
  saveFailedAssistantMessage: (
    threadId: string,
    content: string,
    error: unknown,
  ) => Promise<void>;
  createPdfAttachment: (
    messageId: string,
    pdf: AiAssistantPdf,
  ) => Promise<AiAssistantPdfAttachment>;
  updateAssistantMessageMetadata: (
    messageId: string,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
}

export function streamAiAssistantResponse({
  result,
  saveAssistantMessage,
  saveFailedAssistantMessage,
  createPdfAttachment,
  updateAssistantMessageMetadata,
}: StreamAiAssistantResponseParams): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    let closed = false;
    let draft = '';
    const graphs: AiAssistantGraph[] = [];
    const pdfs: AiAssistantPdf[] = [];
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
            const verifiedGraph =
              part.toolName === 'createBusinessGraph'
                ? getVerifiedGraph(part.output)
                : null;
            if (verifiedGraph) {
              graphs.push(verifiedGraph);
              emit('graph', verifiedGraph);
            }
            const verifiedPdf =
              part.toolName === 'createBusinessPdf'
                ? getVerifiedPdf(part.output)
                : null;
            if (verifiedPdf) {
              pdfs.push(verifiedPdf);
              emit('pdf', { status: 'generating', title: verifiedPdf.title });
            }
            continue;
          }
          if (part.type === 'tool-error') {
            emit('tool', {
              name: part.toolName,
              status: 'failed',
              message:
                part.error instanceof Error
                  ? part.error.message
                  : 'Tool execution failed.',
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
        if (!draft && !pdfs.length)
          throw new Error('The assistant returned an empty response.');
        if (!draft) draft = 'Your PDF is ready.';
        const metadata: Record<string, unknown> = {
          ...(graphs.length ? { graph: graphs[0], graphs } : {}),
        };
        const assistantMessage = await saveAssistantMessage(
          result.threadId,
          draft,
          Object.keys(metadata).length ? metadata : undefined,
        );
        const attachments: AiAssistantPdfAttachment[] = [];
        for (const pdf of pdfs) {
          try {
            const attachment = await createPdfAttachment(
              assistantMessage.id,
              pdf,
            );
            attachments.push(attachment);
            emit('pdf', { status: 'ready', attachment });
          } catch (error) {
            emit('pdf', {
              status: 'failed',
              title: pdf.title,
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to generate the PDF.',
            });
          }
        }
        if (attachments.length) {
          metadata.attachments = attachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
          }));
          await updateAssistantMessageMetadata(assistantMessage.id, metadata);
        }
        emit('done', {
          content: draft,
          threadId: result.threadId,
          userMessageId: result.userMessageId,
          assistantMessageId: assistantMessage.id,
          ...(attachments.length ? { attachments } : {}),
        });
        if (!closed) subscriber.complete();
      } catch (error) {
        try {
          await saveFailedAssistantMessage(result.threadId, draft, error);
        } catch {
          // Preserve the original streaming error when failure persistence also fails.
        }
        emit('error', {
          threadId: result.threadId,
          userMessageId: result.userMessageId,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to stream assistant response.',
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
  if (!output || typeof output !== 'object' || !('graph' in output))
    return null;

  const parsedGraph = AiAssistantGraphSchema.safeParse(output.graph);
  return parsedGraph.success ? parsedGraph.data : null;
}

function getVerifiedPdf(output: unknown): AiAssistantPdf | null {
  if (!output || typeof output !== 'object' || !('pdf' in output)) return null;

  const parsedPdf = AiAssistantPdfSchema.safeParse(output.pdf);
  return parsedPdf.success ? parsedPdf.data : null;
}
