import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table: Knex.TableBuilder) => {
    table.string('entity_type').notNullable().defaultTo('employee');
    table.timestamp('claimed_at').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table: Knex.TableBuilder) => {
    table.dropColumn('entity_type');
    table.dropColumn('claimed_at');
  });
};