import type { ModelMessage } from 'ai';
import { AiChatMessage } from '../../database/entites/ai-chat-message.entity';
import { AiChatThread } from '../../database/entites/ai-chat-thread.entity';

export interface AiAssistantStreamResponse {
  threadId: string;
  userMessageId: string;
  textStream: AsyncIterable<string>;
}

export interface AiChatThreadSummary {
  id: string;
  title?: string;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiChatMessageResponse {
  id: string;
  role: string;
  content: string;
  status?: string;
  errorMessage?: string;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AiChatThreadDetail extends AiChatThreadSummary {
  messages: AiChatMessageResponse[];
}

export interface PreparedAiChatTurn {
  thread: AiChatThread;
  userMessage: AiChatMessage;
  messages: ModelMessage[];
}
