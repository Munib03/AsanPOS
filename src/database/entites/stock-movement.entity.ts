// stock-movement.entity.ts
import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
} from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

import { Inventory } from "./inventory.entity";
import { Sequence } from "./sequence.entity";
import { Store } from "./store.entity";
import { StockMovementItem } from "./stock-movement-item.entity";

@Entity({ tableName: "stock_movement" })
export class StockMovement {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Inventory, { fieldName: "source_inventory_id" })
  sourceInventory!: Inventory;

  @ManyToOne(() => Inventory, { fieldName: "destination_inventory_id" })
  destinationInventory!: Inventory;

  @Property({ default: "draft" })
  status!: string;

  @ManyToOne(() => Sequence, { fieldName: "sequence_id", nullable: true })
  sequence?: Sequence;

  @ManyToOne(() => Store, { fieldName: "store_id" })
  store!: Store;

  @OneToMany(() => StockMovementItem, item => item.stockMovement)
  items = new Collection<StockMovementItem>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}