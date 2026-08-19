import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table) => {
    table.renameColumn('image_url', 'file_url');
    table.string('file_name').nullable();
    table.string('mime_type').nullable();
  });

  await knex.schema.alterTable('attachments', (table) => {
    table.string('file_url').notNullable().alter();
    table.string('entity_type', 255).notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table) => {
    table.string('file_url').nullable().alter();
    table
      .string('entity_type', 255)
      .notNullable()
      .defaultTo('employee')
      .alter();
  });

  await knex.schema.alterTable('attachments', (table) => {
    table.dropColumn('mime_type');
    table.dropColumn('file_name');
    table.renameColumn('file_url', 'image_url');
  });
}
