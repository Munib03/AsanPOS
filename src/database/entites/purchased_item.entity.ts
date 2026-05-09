import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Purchase } from "./purchase.entity";
import { Product } from "./product.entity";

@Entity({ tableName: "purchased_items" })
export class PurchasedItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Purchase, { fieldName: "purchase_id" })
  purchase!: Purchase;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @Property()
  quantity!: number;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number", fieldName: "unit_price" })
  unitPrice!: number;

  @Property({ default: "pending" })
  status!: string;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;
}