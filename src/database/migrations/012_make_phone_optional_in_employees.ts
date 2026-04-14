import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.string('phone').nullable().alter();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.string('phone').notNullable().alter();
  });
};