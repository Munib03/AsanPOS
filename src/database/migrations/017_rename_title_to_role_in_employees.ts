import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  const hasTitle = await knex.schema.hasColumn('employees', 'title');
  if (hasTitle)
    await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
      table.renameColumn('title', 'role');
    });
};

exports.down = async function(knex: Knex): Promise<void> {
  const hasRole = await knex.schema.hasColumn('employees', 'role');
  if (hasRole)
    await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
      table.renameColumn('role', 'title');
    });
};