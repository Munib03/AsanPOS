import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Store } from './store.entity';
import { v4 as uuidv4 } from 'uuid';

@Entity({ tableName: 'employees' })
export class Employee {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ unique: true })
  email!: string;

  @Property()
  name!: string;

  @Property()
  password!: string;

  @Property({ nullable: true })
  phone?: string;

  @Property({ nullable: true })
  title?: string;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => Store)
  store!: Store;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}