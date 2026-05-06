import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('inventory_product');

  if (!exists) {
    await knex.schema.createTable('inventory_product', (table: Knex.TableBuilder) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
      table.uuid('inventory_id').notNullable().references('id').inTable('inventory').onDelete('CASCADE');
      table.unique(['product_id', 'inventory_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('inventory_product');

  if (exists)
    await knex.schema.dropTableIfExists('inventory_product');
}