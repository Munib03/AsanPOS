import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('journal_entry', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sequence_id').nullable().references('id').inTable('sequence');
    table.string('status').nullable().defaultTo('Pending');
    table.uuid('store_id').notNullable().references('id').inTable('stores');
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
  });

  await knex.schema.createTable('journal_entry_items', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('journal_entry_id').notNullable().references('id').inTable('journal_entry');
    table.uuid('purchase_id').nullable().references('id').inTable('purchase');
    table.uuid('sale_id').nullable().references('id').inTable('sale');
    table.uuid('account_id').nullable().references('id').inTable('accounts');
    table.decimal('credit', 10, 2).nullable();
    table.decimal('debit', 10, 2).nullable();
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').nullable();
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('journal_entry_items');
  await knex.schema.dropTableIfExists('journal_entry');
};