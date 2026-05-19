import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry", (table: Knex.TableBuilder) => {
    table.string("status").nullable().defaultTo("Pending");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("journal_entry", (table: Knex.TableBuilder) => {
    table.dropColumn("status");
  });
}