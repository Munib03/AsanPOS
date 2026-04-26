import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.createTable('attachments', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('image_url').nullable();
    table.uuid('entity_id').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('attachments');
};