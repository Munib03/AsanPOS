import { Entity, PrimaryKey, Property, ManyToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from 'uuid';
import { Product } from "./product.entity";

@Entity({ tableName: "inventory" })
export class Inventory {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property()
  name!: string;

  @Property()
  address!: string;

  @Property({ fieldName: 'store_id' })
  storeId!: string;

  @ManyToMany(() => Product, product => product.inventories, { owner: true, pivotTable: 'inventory_product' })
  products = new Collection<Product>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}