import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
import { Employee } from './mployee.entity';
import { v4 as uuidv4 } from 'uuid';

@Entity({ tableName: 'stores' })
export class Store {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  name!: string;

  @Property({ nullable: true })
  address?: string;

  @OneToMany(() => Employee, e => e.store)
  employees = new Collection<Employee>(this);

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}