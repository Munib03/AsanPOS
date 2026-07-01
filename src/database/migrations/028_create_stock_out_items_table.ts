import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("stock_out_items", (table: Knex.TableBuilder) => {
    table.uuid("id").primary();
    table.uuid("stock_out_id").notNullable().references("id").inTable("stock_out");
    table.uuid("product_id").notNullable().references("id").inTable("products");
    table.uuid("sale_item_id").notNullable().references("id").inTable("sale_items");
    table.decimal("quantity", 10, 2).notNullable();
    table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("stock_out_items");
}