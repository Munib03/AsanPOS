import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory_product', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('product_id').notNullable()
      .references('id').inTable('products').onDelete('CASCADE');
    table.uuid('inventory_id').notNullable()
      .references('id').inTable('inventory').onDelete('CASCADE');
    table.unique(['product_id', 'inventory_id']);
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_product');
};