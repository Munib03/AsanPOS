import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { StockOut } from "./stock-out.entity";
import { Product } from "./product.entity";
import { SaleItem } from "./sale-item.entity";

@Entity({ tableName: "stock_out_items" })
export class StockOutItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => StockOut, { fieldName: "stock_out_id" })
  stockOut!: StockOut;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @ManyToOne(() => SaleItem, { fieldName: "sale_item_id" })
  saleItem!: SaleItem;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number" })
  quantity!: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}