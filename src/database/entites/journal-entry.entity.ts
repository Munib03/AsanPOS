import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Sequence } from "./sequence.entity";
import { JournalEntryItem } from "./journal-entry-item.entity";

@Entity({ tableName: "journal_entry" })
export class JournalEntry {

  @PrimaryKey({ type: "uuid" })
  id: string = uuidv4();

  @ManyToOne(() => Sequence, { fieldName: "sequence_id", nullable: true })
  sequence?: Sequence;

  @OneToMany(() => JournalEntryItem, item => item.journalEntry)
  items = new Collection<JournalEntryItem>(this);

  @Property({ fieldName: "created_at", defaultRaw: "now()", nullable: true })
  createdAt?: Date;

  @Property({ fieldName: "updated_at", onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}