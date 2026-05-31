import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Inventory } from "./inventory.entity";
import { Sale } from "./sale.entity";
import { Sequence } from "./sequence.entity";
import { StockOutItem } from "./stock-out-item.entity";

@Entity({ tableName: "stock_out" })
export class StockOut {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Inventory, { fieldName: "inventory_id" })
  inventory!: Inventory;

  @ManyToOne(() => Sale, { fieldName: "sale_id" })
  sale!: Sale;

  @ManyToOne(() => Sequence, { fieldName: "sequence_id" })
  sequence!: Sequence;

  @OneToMany(() => StockOutItem, item => item.stockOut)
  items = new Collection<StockOutItem>(this);

  @Property({ default: "Pending", nullable: true })
  status?: string;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}