import { Entity, PrimaryKey, Property, OneToMany, Collection, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Purchase } from "./purchase.entity";
import { Sale } from "./sale.entity";
import { Store } from "./store.entity";
import { Account } from "./account.entity";

@Entity({ tableName: "customer" })
export class Customer {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property({ nullable: false })
  name!: string;

  @Property({ nullable: false, unique: true })
  phone!: string;

  @Property({ nullable: false })
  address!: string;

  @Property({ onCreate: () => new Date(), nullable: true })
  createdAt?: Date;

  @ManyToOne(() => Account, { fieldName: "payable_id", nullable: true })
  payable?: Account;

  @ManyToOne(() => Account, { fieldName: "receivable_id", nullable: true })
  receivable?: Account;

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;

  @ManyToOne(() => Store, { fieldName: 'store_id', nullable: true })
  store?: Store;

  @OneToMany(() => Purchase, purchase => purchase.customer)
  purchases = new Collection<Purchase>(this);

  @OneToMany(() => Sale, sale => sale.customer)
  sales = new Collection<Sale>(this);
}