import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
} from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

import { Customer } from "./customer.entity";
import { PurchasedItem } from "./purchased_item.entity";
import { Sequence } from "./sequence.entity";
import { Store } from "./store.entity";
import { Inventory } from "./inventory.entity";

@Entity({ tableName: "purchase" })
export class Purchase {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Sequence, { fieldName: "sequence_id" })
  sequence!: Sequence;

  @ManyToOne(() => Customer, { fieldName: "customer_id" })
  customer!: Customer;

  @ManyToOne(() => Store, { fieldName: "store_id" })
  store!: Store;

  @ManyToOne(() => Inventory, { fieldName: "inventory_id" })
  inventory!: Inventory;

  @Property({ fieldName: "custom_date", nullable: true })
  customDate?: Date;

  @Property({ default: "draft" })
  status!: string;

  @OneToMany(() => PurchasedItem, item => item.purchase)
  items = new Collection<PurchasedItem>(this);

  @Property({
    fieldName: "created_at",
    defaultRaw: "now()",
    nullable: true,
  })
  createdAt?: Date;

  @Property({
    fieldName: "updated_at",
    onUpdate: () => new Date(),
    nullable: true,
  })
  updatedAt?: Date;
}