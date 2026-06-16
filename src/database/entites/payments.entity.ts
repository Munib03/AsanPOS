import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Sale } from './sale.entity';
import { Purchase } from './purchase.entity';
import { StoreSession } from './store-session.entity';

@Entity({ tableName: 'payments' })
export class Payment {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Sale, { fieldName: 'sale_id', nullable: true })
  sale?: Sale;

  @ManyToOne(() => Purchase, { fieldName: 'purchase_id', nullable: true })
  purchase?: Purchase;

  @ManyToOne(() => StoreSession, { fieldName: 'store_session_id', nullable: true })
  storeSession?: StoreSession;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number' })
  amount!: number;

  @Property({ nullable: true })
  note?: string;

  @Property({ default: 'done' })
  status: string = 'done';

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}