import { Knex } from "knex";

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.string('title').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.dropColumn('title');
  });
};