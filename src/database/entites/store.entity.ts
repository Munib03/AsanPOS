import { Entity, PrimaryKey, Property, OneToMany } from '@mikro-orm/core';
import { Employee } from './mployee.entity';

@Entity({ tableName: 'stores' })
export class Store {

  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property()
  name!: string;

  @Property()
  address!: string;

  @OneToMany(() => Employee, e => e.store)
  employees!: Employee[];

  @Property({ defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()' })
  updatedAt: Date = new Date();
  
}