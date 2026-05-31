import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Sale } from "./sale.entity";
import { Product } from "./product.entity";

@Entity({ tableName: "sale_items" })
export class SaleItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Sale, { fieldName: "sale_id" })
  sale!: Sale;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number", nullable: true })
  quantity?: number;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number", fieldName: "unit_price", nullable: true })
  unitPrice?: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}