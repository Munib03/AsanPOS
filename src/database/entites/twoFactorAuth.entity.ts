import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Employee } from './mployee.entity';
import { IsOptional } from 'class-validator';

@Entity({ tableName: 'two_factor_auth' })
export class TwoFactorAuth {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @ManyToOne(() => Employee)
  employee!: Employee;

  @Property()
  secret!: string;

  @Property({ nullable: true })
  createdAt?: Date;

  @Property({ nullable: true })
  expiresAt?: Date;
}