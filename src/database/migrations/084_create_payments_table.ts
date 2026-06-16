import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('payments');
  if (!exists) {
    await knex.schema.createTable('payments', (table) => {
      table.uuid('id').primary();
      table.uuid('purchase_id').nullable().references('id').inTable('purchase');
      table.uuid('sale_id').nullable().references('id').inTable('sale');
      table.uuid('store_session_id').nullable().references('id').inTable('store_session');
      table.decimal('amount', 10, 2).notNullable();
      table.string('note').nullable();
      table.string('status').notNullable().defaultTo('draft');
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payments');
}