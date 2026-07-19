export interface AiAssistantStreamPart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  output?: unknown;
  error?: unknown;
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
