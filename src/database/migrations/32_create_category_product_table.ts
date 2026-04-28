import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('category_product');

  if (!exists) {
    await knex.schema.createTable('category_product', (table) => {
      table
        .uuid('id')
        .primary()
        .defaultTo(knex.raw('gen_random_uuid()'));

      table.uuid('product_id').notNullable();
      table.uuid('category_id').notNullable();

      table
        .foreign('product_id')
        .references('id')
        .inTable('products')
        .onDelete('CASCADE');

      table
        .foreign('category_id')
        .references('id')
        .inTable('categories')
        .onDelete('CASCADE');

      table.unique(['product_id', 'category_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('category_product');

  if (exists) {
    await knex.schema.dropTable('category_product');
  }
}