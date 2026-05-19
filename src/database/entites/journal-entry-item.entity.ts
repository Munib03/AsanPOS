import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { JournalEntry } from "./journal-entry.entity";
import { Purchase } from "./purchase.entity";
import { Account } from "./account.entity";

@Entity({ tableName: "journal_entry_items" })
export class JournalEntryItem {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => JournalEntry, { fieldName: "journal_entry_id" })
  journalEntry!: JournalEntry;

  @ManyToOne(() => Purchase, { fieldName: "purchase_id" })
  purchase!: Purchase;

  @ManyToOne(() => Account, { fieldName: "acount_id" })
  account!: Account;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number", nullable: true })
  credit?: number;

  @Property({ columnType: "decimal(10,2)", runtimeType: "number", nullable: true })
  debit?: number;

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}