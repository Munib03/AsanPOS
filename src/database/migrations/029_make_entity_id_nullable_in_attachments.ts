import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table: Knex.TableBuilder) => {
    table.uuid('entity_id').nullable().alter();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table: Knex.TableBuilder) => {
    table.uuid('entity_id').notNullable().alter();
  });
};