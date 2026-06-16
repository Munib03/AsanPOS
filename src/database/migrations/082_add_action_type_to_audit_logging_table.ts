import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('audit_logging', 'action_type');
  if (!hasColumn) {
    await knex.schema.alterTable('audit_logging', (table) => {
      table.string('action_type').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('audit_logging', 'action_type');
  if (hasColumn) {
    await knex.schema.alterTable('audit_logging', (table) => {
      table.dropColumn('action_type');
    });
  }
}