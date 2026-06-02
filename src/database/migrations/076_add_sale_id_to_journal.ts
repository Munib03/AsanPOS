import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry_items", (table: Knex.TableBuilder) => {
    table.uuid("purchase_id").nullable().alter();
    table.uuid("sale_id").nullable().references("id").inTable("sale");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry_items", (table: Knex.TableBuilder) => {
    table.dropColumn("sale_id");
  });
}