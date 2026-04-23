import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.string('secret_data').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.dropColumn('secret_data');
  });
};