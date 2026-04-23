import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.jsonb('metadata').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.dropColumn('metadata');
  });
};