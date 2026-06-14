import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable("sale_items");
  if (!exists) {
    await knex.schema.createTable("sale_items", (table: Knex.TableBuilder) => {
      table.uuid("id").primary();
      table.uuid("sale_id").notNullable().references("id").inTable("sale");
      table.uuid("product_id").notNullable().references("id").inTable("products");
      table.decimal("quantity", 10, 2).nullable();
      table.decimal("unit_price", 10, 2).nullable();
      table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sale_items");
}