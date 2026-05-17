import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { StockIn } from "./stock-in.entity";
import { Product } from "./product.entity";
import { PurchasedItem } from "./purchased_item.entity";

@Entity({ tableName: "stock_in_items" })
export class StockInItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => StockIn, { fieldName: "stock_in_id" })
  stockIn!: StockIn;

  @ManyToOne(() => Product, { fieldName: "product_id" })
  product!: Product;

  @ManyToOne(() => PurchasedItem, { fieldName: "purchased_item_id" })
  purchasedItem!: PurchasedItem;

  @Property({ columnType: 'decimal(10,2)', runtimeType: 'number' })
  quantity!: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}