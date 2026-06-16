import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Store } from './store.entity';
import { Employee } from './employee.entity';
import { Payment } from './payments.entity';
import { CashMovement } from './cash-movement.entity';

@Entity({ tableName: 'store_session' })
export class StoreSession {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Store, { fieldName: 'store_id' })
  store!: Store;

  @ManyToOne(() => Employee, { fieldName: 'opened_by_emp_id', nullable: true })
  openedBy?: Employee;

  @ManyToOne(() => Employee, { fieldName: 'closed_by_emp_id', nullable: true })
  closedBy?: Employee;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number', fieldName: 'opening_amount', nullable: true })
  openingAmount?: number;

  @Property({ fieldName: 'opening_note', nullable: true })
  openingNote?: string;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number', fieldName: 'closing_amount', nullable: true })
  closingAmount?: number;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number', fieldName: 'expected_amount', nullable: true })
  expectedAmount?: number;

  @Property({ fieldName: 'closing_note', nullable: true })
  closingNote?: string;

  @Property({ fieldName: 'opened_at', nullable: true })
  openedAt?: Date;

  @Property({ fieldName: 'closed_at', nullable: true })
  closedAt?: Date;

  @OneToMany(() => Payment, payment => payment.storeSession)
  payments = new Collection<Payment>(this);

  @OneToMany(() => CashMovement, cm => cm.storeSession)
  cashMovements = new Collection<CashMovement>(this);
}