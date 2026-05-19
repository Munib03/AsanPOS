import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("journal_entry", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("sequence_id").nullable().references("id").inTable("sequence");
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });

  await knex.schema.createTable("journal_entry_items", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("journal_entry_id").notNullable().references("id").inTable("journal_entry");
    table.uuid("purchase_id").notNullable().references("id").inTable("purchase");
    table.uuid("customer_id").notNullable().references("id").inTable("customer");
    table.decimal("credit", 10, 2).nullable();
    table.decimal("debit", 10, 2).nullable();
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("journal_entry_items");
  await knex.schema.dropTableIfExists("journal_entry");
}