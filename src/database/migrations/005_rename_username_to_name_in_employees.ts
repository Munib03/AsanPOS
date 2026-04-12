import { Knex } from "knex";

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.renameColumn('username', 'name');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.renameColumn('name', 'username');
  });
};