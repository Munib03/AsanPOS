import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("stores", (table: Knex.TableBuilder) => {
    table.uuid("store_settings_id").nullable().references("id").inTable("store_settings");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("stores", (table: Knex.TableBuilder) => {
    table.dropColumn("store_settings_id");
  });
}