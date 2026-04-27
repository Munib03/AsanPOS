import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('attachments', 'claimed_at');

  if (hasColumn) {
    await knex.schema.alterTable('attachments', (table) => {
      table.dropColumn('claimed_at');
    });
  }

  await knex.schema.alterTable('attachments', (table) => {
    table.timestamp('claimed_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('attachments', 'claimed_at');

  if (hasColumn) {
    await knex.schema.alterTable('attachments', (table) => {
      table.dropColumn('claimed_at');
    });
  }
}