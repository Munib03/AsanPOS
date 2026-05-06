import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';

@Entity({ tableName: 'customer' })
export class Customer {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ nullable: true })
  name?: string;

  @Property({ nullable: true })
  address?: string;

  @Property({ nullable: true })
  phone?: string;

  // @Property({ fieldName: 'store_id' })
  // storeId!: string;

  // @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  // createdAt?: Date;

  // @Property({ fieldName: 'updated_at', defaultRaw: 'now()', onUpdate: () => new Date(), nullable: true })
  // updatedAt?: Date;
}