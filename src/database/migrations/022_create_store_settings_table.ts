import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("store_settings", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("default_account_id").notNullable().references("id").inTable("accounts");
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("store_settings");
}