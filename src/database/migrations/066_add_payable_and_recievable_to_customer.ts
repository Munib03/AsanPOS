import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
    table.uuid("payable_id").nullable().references("id").inTable("accounts");
    table.uuid("receivable_id").nullable().references("id").inTable("accounts");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
    table.dropColumn("payable_id");
    table.dropColumn("receivable_id");
  });
}