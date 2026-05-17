import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.dropForeign(["inventory_id"]);
    table.dropColumn("inventory_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.uuid("inventory_id").nullable().references("id").inTable("inventory");
  });
}