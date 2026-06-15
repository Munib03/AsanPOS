import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasStatus = await knex.schema.hasColumn('sale', 'status');
  if (!hasStatus) {
    await knex.schema.alterTable('sale', (table) => {
      table.string('status').notNullable().defaultTo('draft');
    });
  }

  const hasAuditTable = await knex.schema.hasTable('audit_logging');
  if (!hasAuditTable) {
    await knex.schema.createTable('audit_logging', (table) => {
      table.uuid('id').primary();
      table.uuid('employee_id').notNullable().references('id').inTable('employees');
      table.json('before').nullable();
      table.json('after').nullable();
      table.string('entity_type').notNullable();
      table.uuid('entity_id').nullable();
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logging');
  const hasStatus = await knex.schema.hasColumn('sale', 'status');
  if (hasStatus) {
    await knex.schema.alterTable('sale', (table) => {
      table.dropColumn('status');
    });
  }
}