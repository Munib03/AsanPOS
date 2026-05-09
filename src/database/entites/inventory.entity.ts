import { Entity, PrimaryKey, Property, ManyToMany, Collection, ManyToOne, OneToMany } from "@mikro-orm/core";
import { v4 as uuidv4 } from 'uuid';
import { Product } from "./product.entity";
import { Store } from "./store.entity";
import { Purchase } from "./purchase.entity";
import { PurchasedItem } from "./purchased_item.entity";

@Entity({ tableName: "inventory" })
export class Inventory {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property()
  name!: string;

  @Property()
  address!: string;

  @ManyToOne(() => Store, { fieldName: 'store_id' })
  store!: Store;

  @ManyToMany(() => Product, product => product.inventories, { owner: true, pivotTable: 'inventory_product' })
  products = new Collection<Product>(this);

  @OneToMany(() => Purchase, purchase => purchase.inventory)
  purchases = new Collection<Purchase>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}