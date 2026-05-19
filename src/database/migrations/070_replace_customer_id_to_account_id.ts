import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry_items", (table: Knex.TableBuilder) => {
    table.dropColumn("customer_id");
    table.uuid("acount_id").nullable().references("id").inTable("accounts");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry_items", (table: Knex.TableBuilder) => {
    table.dropColumn("account_id");
    table.uuid("customer_id").nullable().references("id").inTable("customer");
  });
}