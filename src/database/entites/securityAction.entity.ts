import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Employee } from './Employee.entity';

@Entity({ tableName: 'security_actions' })
export class SecurityAction {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Employee)
  employee!: Employee;

  @Property()
  actionType!: string;

  @Property({ nullable: true })
  secret?: string;

  @Property({ nullable: true })
  expiresAt?: Date;

  @Property({ defaultRaw: 'now()' })
  createdAt: Date = new Date();
}