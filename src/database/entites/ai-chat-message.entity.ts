import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { AiChatThread } from './ai-chat-thread.entity';

@Entity({ tableName: 'ai_chat_message' })
export class AiChatMessage {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => AiChatThread, { fieldName: 'thread_id' })
  thread!: AiChatThread;

  @Property()
  role!: string;

  @Property({ type: 'text' })
  content!: string;

  @Property({ nullable: true })
  status?: string;

  @Property({ fieldName: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Property({ nullable: true })
  model?: string;

  @Property({ nullable: true })
  provider?: string;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({
    fieldName: 'updated_at',
    onUpdate: () => new Date(),
    nullable: true,
  })
  updatedAt?: Date;
}
