import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Inventory } from "./inventory.entity";
import { Purchase } from "./purchase.entity";
import { Sequence } from "./sequence.entity";
import { StockInItem } from "./stock-in-item.entity";
import { StockInStatus } from "../../shared/utils/stock-in-status.enum";

@Entity({ tableName: "stock_in" })
export class StockIn {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Inventory, { fieldName: "inventory_id" })
  inventory!: Inventory;

  @ManyToOne(() => Purchase, { fieldName: "purchase_id" })
  purchase!: Purchase;

  @ManyToOne(() => Sequence, { fieldName: "sequence_id" })
  sequence!: Sequence;

  @Property({ default: StockInStatus.PENDING })
  status!: string;

  @OneToMany(() => StockInItem, item => item.stockIn)
  items = new Collection<StockInItem>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}