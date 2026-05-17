import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Inventory } from "./inventory.entity";
import { Product } from "./product.entity";

@Entity({ tableName: "stock_quantity" })
export class StockQuantity {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Inventory, { fieldName: "inventory_id" })
  inventory!: Inventory;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @Property({ nullable: true, columnType: 'decimal(10,2)', runtimeType: 'number' })
  quantity?: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}