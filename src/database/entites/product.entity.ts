import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Category } from './category.entity';
import { v4 as uuidv4 } from 'uuid';

@Entity({ tableName: 'products' })
export class Product {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  name!: string;

  @ManyToOne(() => Category, { nullable: true, fieldName: 'cat_id' })
  category?: Category;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}