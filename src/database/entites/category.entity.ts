import { Entity, PrimaryKey, Property, OneToMany, Collection, ManyToOne } from '@mikro-orm/core';
import { Product } from './product.entity';
import { Store } from './store.entity';
import { v4 as uuidv4 } from 'uuid';

@Entity({ tableName: 'categories' })
export class Category {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  name!: string;

  @ManyToOne(() => Store)
  store!: Store;

  @OneToMany(() => Product, p => p.category)
  products = new Collection<Product>(this);

  @Property({ fieldName: 'created_at', defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ fieldName: 'updated_at', onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}