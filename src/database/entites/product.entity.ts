import { Entity, PrimaryKey, Property, ManyToMany, Collection, OneToMany, ManyToOne } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Category } from './category.entity';
import { ProductImage } from './product-image.entity';
import { Store } from './store.entity';
import { Inventory } from './inventory.entity';
import { BaseRepository } from '../../shared/repositories/base.repository';


@Entity({ tableName: 'products', repository: () => BaseRepository })
export class Product {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ nullable: true })
  name?: string;

  @Property({ nullable: true, fieldName: 'scanner_id' })
  scannerId?: string;

  @Property({ nullable: true, columnType: 'decimal(10,2)', runtimeType: 'number' })
  price?: number;

  @ManyToMany(() => Category, category => category.products, { owner: true, pivotTable: 'category_product' })
  categories = new Collection<Category>(this);

  @OneToMany(() => ProductImage, image => image.product)
  images = new Collection<ProductImage>(this);

  @ManyToOne(() => Store)
  store!: Store;

  @ManyToMany(() => Inventory, inventory => inventory.products)
  inventories = new Collection<Inventory>(this);

  @Property({ defaultRaw: 'now()', nullable: true, fieldName: 'created_at' })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true, fieldName: 'updated_at' })
  updatedAt?: Date;
}