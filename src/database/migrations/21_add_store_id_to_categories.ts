import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.uuid('store_id').nullable().references('id').inTable('stores').onDelete('CASCADE');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.dropColumn('store_id');
  });
};