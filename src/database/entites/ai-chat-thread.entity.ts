import {
  Collection,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Employee } from './employee.entity';
import { Store } from './store.entity';
import { AiChatMessage } from './ai-chat-message.entity';

@Entity({ tableName: 'ai_chat_thread' })
export class AiChatThread {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Store, { fieldName: 'store_id' })
  store!: Store;

  @ManyToOne(() => Employee, { fieldName: 'employee_id' })
  employee!: Employee;

  @Property({ nullable: true })
  title?: string;

  @Property({ fieldName: 'last_message_at', nullable: true })
  lastMessageAt?: Date;

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({
    fieldName: 'updated_at',
    onUpdate: () => new Date(),
    nullable: true,
  })
  updatedAt?: Date;

  @Property({ fieldName: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null = null;

  @OneToMany(() => AiChatMessage, (message) => message.thread)
  messages = new Collection<AiChatMessage>(this);
}
