import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Store } from './Store';

@Entity()
export class Employee {

  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property()
  username!: string;

  @Property()
  password!: string;

  @Property()
  phone!: string;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => Store)
  store!: Store;

  @Property({ defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()' })
  updatedAt: Date = new Date();
}