import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('two_factor_auth', (table: Knex.TableBuilder) => {
    table.dropColumn('backup_code');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('two_factor_auth', (table: Knex.TableBuilder) => {
    table.string('backup_code').notNullable().defaultTo('');
  });
};