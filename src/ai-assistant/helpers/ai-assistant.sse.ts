import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AiAssistantStreamPart } from '../../shared/types/ai-assistant.types';

interface StreamSanitizerState {
  buffer: string;
  inHiddenBlock: boolean;
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
  ) => Promise<{ id: string }>;
  saveFailedAssistantMessage: (
    threadId: string,
    content: string,
    error: unknown,
  ) => Promise<void>;
}

export function streamAiAssistantResponse({
  result,
  saveAssistantMessage,
  saveFailedAssistantMessage,
}: StreamAiAssistantResponseParams): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    let closed = false;
    let fullResponse = '';
    let hasVisibleContent = false;
    const sanitizer: StreamSanitizerState = { buffer: '', inHiddenBlock: false };
    const emit = (type: string, data: Record<string, unknown>) => {
      if (!closed) subscriber.next({ type, data });
    };

    void (async () => {
      try {
        for await (const part of result.fullStream) {
          if (closed) return;
          if (part.type === 'tool-call' || part.type === 'tool-result') {
            emit(part.type, { toolCallId: part.toolCallId, toolName: part.toolName, status: part.type === 'tool-call' ? 'started' : 'completed' });
            continue;
          }
          if (part.type === 'tool-error') {
            emit('tool-result', { toolCallId: part.toolCallId, toolName: part.toolName, status: 'failed' });
            continue;
          }
          if (part.type !== 'text-delta' || !part.text) continue;
          const safeChunk = sanitizeStreamChunk(part.text, sanitizer);
          const contentChunk = hasVisibleContent
            ? safeChunk
            : safeChunk.trimStart();
          if (!contentChunk) continue;
          hasVisibleContent = true;
          fullResponse += contentChunk;
          emit('chunk', { content: contentChunk });
        }

        const finalChunk = flushSanitizedStream(sanitizer);
        const contentChunk = hasVisibleContent
          ? finalChunk
          : finalChunk.trimStart();
        if (contentChunk) {
          fullResponse += contentChunk;
          emit('chunk', { content: contentChunk });
        }
        const finalResponse = fullResponse.trim();
        const assistantMessage = await saveAssistantMessage(result.threadId, finalResponse);
        emit('done', { content: finalResponse, threadId: result.threadId, userMessageId: result.userMessageId, assistantMessageId: assistantMessage.id });
        if (!closed) subscriber.complete();
      } catch (error) {
        try { await saveFailedAssistantMessage(result.threadId, fullResponse, error); } catch { }
        emit('error', { threadId: result.threadId, userMessageId: result.userMessageId, message: error instanceof Error ? error.message : 'Failed to stream assistant response.' });
        if (!closed) subscriber.complete();
      }
    })();

    return () => { closed = true; };
  });
}

function sanitizeStreamChunk(
  chunk: string,
  state: StreamSanitizerState,
): string {
  const startTags = ['<think>', '<thinking>'];
  const endTags = ['</think>', '</thinking>'];
  const maxStartTagLength = Math.max(...startTags.map((tag) => tag.length));
  const maxEndTagLength = Math.max(...endTags.map((tag) => tag.length));
  let output = '';

  state.buffer += chunk;

  while (state.buffer.length > 0) {
    const lowerBuffer = state.buffer.toLowerCase();

    if (state.inHiddenBlock) {
      const endMatch = findEarliestTag(lowerBuffer, endTags);

      if (!endMatch) {
        state.buffer = state.buffer.slice(-(maxEndTagLength - 1));
        return output;
      }

      state.buffer = state.buffer.slice(endMatch.index + endMatch.tag.length);
      state.inHiddenBlock = false;
      continue;
    }

    const startMatch = findEarliestTag(lowerBuffer, startTags);

    if (startMatch) {
      output += state.buffer.slice(0, startMatch.index);
      state.buffer = state.buffer.slice(
        startMatch.index + startMatch.tag.length,
      );
      state.inHiddenBlock = true;
      continue;
    }

    if (state.buffer.length < maxStartTagLength) return output;

    const safeLength = state.buffer.length - (maxStartTagLength - 1);
    output += state.buffer.slice(0, safeLength);
    state.buffer = state.buffer.slice(safeLength);
    return output;
  }

  return output;
}

function flushSanitizedStream(state: StreamSanitizerState): string {
  if (state.inHiddenBlock) {
    state.buffer = '';
    state.inHiddenBlock = false;
    return '';
  }

  const output = state.buffer;
  state.buffer = '';
  return output;
}

function findEarliestTag(
  text: string,
  tags: string[],
): { index: number; tag: string } | null {
  return tags.reduce<{ index: number; tag: string } | null>((best, tag) => {
    const index = text.indexOf(tag);
    if (index === -1) return best;
    if (!best || index < best.index) return { index, tag };
    return best;
  }, null);
}
