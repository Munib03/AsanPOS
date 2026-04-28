import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('products', 'scanner_id');

  if (!exists) {
    await knex.schema.alterTable('products', (table) => {
      table.string('scanner_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasColumn('products', 'scanner_id');

  if (exists) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('scanner_id');
    });
  }
}