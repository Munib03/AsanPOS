import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

@Entity({ tableName: "sequence" })
export class Sequence {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @Property()
  entity!: string;

  @Property()
  prefix!: string;

  @Property({ fieldName: "last_index" })
  lastIndex!: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", defaultRaw: "now()", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}