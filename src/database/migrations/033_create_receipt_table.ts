import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('receipt');
  if (!exists) {
    await knex.schema.createTable('receipt', (table) => {
      table.uuid('id').primary();
      table.uuid('store_id').notNullable().references('id').inTable('stores');
      table.uuid('session_id').notNullable().references('id').inTable('store_session');
      table.json('items').nullable();
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('receipt');
}