import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Store } from './store.entity';
import { StoreSession } from './store-session.entity';

@Entity({ tableName: 'receipt' })
export class Receipt {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Store, { fieldName: 'store_id' })
  store!: Store;

  @ManyToOne(() => StoreSession, { fieldName: 'session_id' })
  session!: StoreSession;

  @Property({ type: 'json', nullable: true })
  items?: Record<string, any>;

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;
}