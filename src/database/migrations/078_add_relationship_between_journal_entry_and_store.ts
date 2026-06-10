import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('journal_entry', (table) => {
    table.uuid('store_id').notNullable();
    table.foreign('store_id').references('id').inTable('stores');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('journal_entry', (table) => {
    table.dropForeign(['store_id']);
    table.dropColumn('store_id');
  });
}