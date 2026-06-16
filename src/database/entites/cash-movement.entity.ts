import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { StoreSession } from './store-session.entity';
import { Employee } from './employee.entity';

@Entity({ tableName: 'cash_movement' })
export class CashMovement {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => StoreSession, { fieldName: 'store_session_id' })
  storeSession!: StoreSession;

  @Property()
  type!: string;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number', nullable: true })
  amount?: number;

  @Property({ nullable: true })
  note?: string;

  @ManyToOne(() => Employee, { fieldName: 'created_by_emp_id', nullable: true })
  createdBy?: Employee;

  @Property({ default: 'pending' })
  status: string = 'pending';

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;
}