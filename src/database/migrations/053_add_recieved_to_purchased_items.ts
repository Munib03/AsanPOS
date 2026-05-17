import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchased_items", (table: Knex.TableBuilder) => {
    table.decimal("received", 10, 2).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchased_items", (table: Knex.TableBuilder) => {
    table.dropColumn("received");
  });
}