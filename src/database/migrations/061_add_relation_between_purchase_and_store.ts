import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.uuid("store_id").nullable().references("id").inTable("stores");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.dropColumn("store_id");
  });
}