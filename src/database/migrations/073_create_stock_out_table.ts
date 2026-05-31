import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("stock_out", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("inventory_id").notNullable().references("id").inTable("inventory");
    table.uuid("sale_id").notNullable().references("id").inTable("sale");
    table.uuid("sequence_id").notNullable().references("id").inTable("sequence");
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("stock_out");
}