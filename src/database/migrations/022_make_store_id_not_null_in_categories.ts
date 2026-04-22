import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.uuid('store_id').notNullable().alter();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.uuid('store_id').nullable().alter();
  });
};