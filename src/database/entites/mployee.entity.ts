import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Store } from './store.entity';


@Entity({ tableName: 'employees' })
export class Employee {

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string;

  @Property({ unique: true })
  email!: string;

  @Property()
  name!: string;

  @Property()
  password!: string;

  @Property({ nullable: true })
  phone!: string;

  @Property({ nullable: true })
  title?: string;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => Store)
  store!: Store;

  @Property({ defaultRaw: 'now()' })
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()' })
  updatedAt: Date = new Date();
}