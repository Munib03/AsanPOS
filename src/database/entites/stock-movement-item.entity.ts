// stock-movement-item.entity.ts
import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

import { StockMovement } from "./stock-movement.entity";
import { Product } from "./product.entity";

@Entity({ tableName: "stock_movement_items" })
export class StockMovementItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => StockMovement, { fieldName: "stock_movement_id" })
  stockMovement!: StockMovement;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number" })
  quantity!: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}