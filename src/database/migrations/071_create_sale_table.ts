import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sale", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("sequence_id").notNullable().references("id").inTable("sequence");
    table.uuid("customer_id").notNullable().references("id").inTable("customer");
    table.uuid("store_id").notNullable().references("id").inTable("stores");
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sale");
}