import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.createTable('customer', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('address').notNullable();
    table.string('phone').notNullable().unique();
    table.uuid('store_id').nullable()
      .references('id').inTable('stores').onDelete('CASCADE');
    table.uuid('payable_id').nullable().references('id').inTable('accounts');
    table.uuid('receivable_id').nullable().references('id').inTable('accounts');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customer');
};