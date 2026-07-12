import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.dropColumn('name');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.string('name').nullable();
  });
}
