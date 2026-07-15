import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sale', (table) => {
    table.string('payment_status').notNullable().defaultTo('unpaid');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sale', (table) => {
    table.dropColumn('payment_status');
  });
}
