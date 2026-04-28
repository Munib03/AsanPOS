import { Entity, PrimaryKey, Property, ManyToMany, Collection, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Product } from './product.entity';
import { Store } from './store.entity';

@Entity({ tableName: 'categories' })
export class Category {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  name!: string;

  @ManyToOne(() => Store, { nullable: true })
  store?: Store;

  @ManyToMany(() => Product, product => product.categories)
  products = new Collection<Product>(this);

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}