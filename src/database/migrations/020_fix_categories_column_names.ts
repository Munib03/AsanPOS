import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.renameColumn('created_At', 'created_at');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table: Knex.TableBuilder) => {
    table.renameColumn('created_at', 'created_At');
  });
};