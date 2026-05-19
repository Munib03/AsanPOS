import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

@Entity({ tableName: "accounts" })
export class Account {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property({ nullable: true })
  name?: string;

  @Property({ nullable: true })
  type?: string;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}