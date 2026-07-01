import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('stock_out', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('inventory_id').notNullable()
      .references('id').inTable('inventory');
    table.uuid('sale_id').notNullable()
      .references('id').inTable('sale');
    table.uuid('sequence_id').notNullable()
      .references('id').inTable('sequence');
    table.string('status').nullable().defaultTo('Pending');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stock_out');
};