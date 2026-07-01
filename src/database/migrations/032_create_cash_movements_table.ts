import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('cash_movement');
  if (!exists) {
    await knex.schema.createTable('cash_movement', (table) => {
      table.uuid('id').primary();
      table.uuid('store_session_id').notNullable().references('id').inTable('store_session');
      table.string('type').notNullable();
      table.decimal('amount', 10, 2).nullable();
      table.string('note').nullable();
      table.uuid('created_by_emp_id').nullable().references('id').inTable('employees');
      table.string('status').notNullable().defaultTo('pending');
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cash_movement');
}