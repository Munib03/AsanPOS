import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('security_actions', 'secret_data');
  if (hasColumn)
    await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
      table.dropColumn('secret_data');
    });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('security_actions', (table: Knex.TableBuilder) => {
    table.string('secret_data').nullable();
  });
};