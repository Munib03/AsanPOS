import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stores', (table: Knex.TableBuilder) => {
    table.string('address').nullable().alter();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stores', (table: Knex.TableBuilder) => {
    table.string('address').notNullable().alter();
  });
};