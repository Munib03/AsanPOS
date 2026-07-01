import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('security_actions', 'secret_data');
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    if (hasColumn) table.dropColumn('secret_data');
    table.jsonb('metadata').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.dropColumn('metadata');
    table.string('secret_data').nullable();
  });
};