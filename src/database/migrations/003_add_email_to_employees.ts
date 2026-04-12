import { Knex } from "knex";

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.string('email').notNullable().defaultTo('');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.dropColumn('email');
  });
};