import type { Response } from 'express';

interface StreamSanitizerState {
  buffer: string;
  inHiddenBlock: boolean;
}

interface StreamAiAssistantResponseParams {
  result: {
    threadId: string;
    userMessageId: string;
    textStream: AsyncIterable<string>;
  };
  res: Response;
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

export async function streamAiAssistantResponse({
  result,
  res,
  saveAssistantMessage,
  saveFailedAssistantMessage,
}: StreamAiAssistantResponseParams): Promise<void> {
  prepareSseResponse(res);

  let fullResponse = '';
  const sanitizer: StreamSanitizerState = {
    buffer: '',
    inHiddenBlock: false,
  };

  try {
    for await (const chunk of result.textStream) {
      if (res.writableEnded) return;

      const safeChunk = sanitizeStreamChunk(chunk, sanitizer);
      if (!safeChunk) continue;

      fullResponse += safeChunk;
      writeSseEvent(res, 'chunk', { content: safeChunk });
    }

    const finalChunk = flushSanitizedStream(sanitizer);
    if (finalChunk) {
      fullResponse += finalChunk;
      writeSseEvent(res, 'chunk', { content: finalChunk });
    }

    const assistantMessage = await saveAssistantMessage(
      result.threadId,
      fullResponse,
    );

    writeSseEvent(res, 'done', {
      content: fullResponse,
      threadId: result.threadId,
      userMessageId: result.userMessageId,
      assistantMessageId: assistantMessage.id,
    });
    res.end();
  } catch (error) {
    try {
      await saveFailedAssistantMessage(result.threadId, fullResponse, error);
    } catch {}

    writeSseEvent(res, 'error', {
      threadId: result.threadId,
      userMessageId: result.userMessageId,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to stream assistant response.',
    });
    res.end();
  }
}

function prepareSseResponse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeSseEvent(
  res: Response,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
