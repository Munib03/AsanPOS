import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table: Knex.TableBuilder) => {
    table.string("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table: Knex.TableBuilder) => {
    table.dropColumn("deleted_at");
  });
}