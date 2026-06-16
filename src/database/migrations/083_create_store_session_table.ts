import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('store_session');
  if (!exists) {
    await knex.schema.createTable('store_session', (table) => {
      table.uuid('id').primary();
      table.uuid('store_id').notNullable().references('id').inTable('stores');
      table.uuid('opened_by_emp_id').nullable().references('id').inTable('employees');
      table.uuid('closed_by_emp_id').nullable().references('id').inTable('employees');
      table.decimal('opening_amount', 10, 2).nullable();
      table.string('opening_note').nullable();
      table.decimal('closing_amount', 10, 2).nullable();
      table.decimal('expected_amount', 10, 2).nullable();
      table.string('closing_note').nullable();
      table.timestamp('opened_at').nullable();
      table.timestamp('closed_at').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('store_session');
}