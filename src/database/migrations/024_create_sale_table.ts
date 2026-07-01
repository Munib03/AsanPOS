import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('sale', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sequence_id').notNullable()
      .references('id').inTable('sequence');
    table.uuid('customer_id').notNullable()
      .references('id').inTable('customer');
    table.uuid('store_id').notNullable()
      .references('id').inTable('stores');
    table.string('status').notNullable().defaultTo('draft');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sale');
};