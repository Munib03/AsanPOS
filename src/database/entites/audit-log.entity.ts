import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Employee } from './employee.entity';

@Entity({ tableName: 'audit_logging' })
export class AuditLog {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Employee, { fieldName: 'employee_id' })
  employee!: Employee;

  @Property({ type: 'json', nullable: true })
  before?: Record<string, any>;

  @Property({ type: 'json', nullable: true })
  after?: Record<string, any>;

  @Property({ fieldName: 'entity_type' })
  entityType!: string;

  @Property({ fieldName: 'entity_id', type: 'uuid', nullable: true })
  entityId?: string;

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;
}