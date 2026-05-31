import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Customer } from "./customer.entity";
import { Store } from "./store.entity";
import { Sequence } from "./sequence.entity";
import { SaleItem } from "./sale-item.entity";

@Entity({ tableName: "sale" })
export class Sale {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Sequence, { fieldName: "sequence_id" })
  sequence!: Sequence;

  @ManyToOne(() => Customer, { fieldName: "customer_id" })
  customer!: Customer;

  @ManyToOne(() => Store, { fieldName: "store_id" })
  store!: Store;

  @OneToMany(() => SaleItem, item => item.sale)
  items = new Collection<SaleItem>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}