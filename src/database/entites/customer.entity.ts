import { Entity, PrimaryKey, Property, OneToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Purchase } from "./purchase.entity";

@Entity({ tableName: "customer" })
export class Customer {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property({ nullable: true })
  name?: string;

  @Property({ nullable: true })
  phone?: string;

  @Property({ nullable: true })
  address?: string;

  @OneToMany(() => Purchase, purchase => purchase.customer)
  purchases = new Collection<Purchase>(this);
}