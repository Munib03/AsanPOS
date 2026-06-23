import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('purchase', (table) => {
    table.uuid('inventory_id').nullable();
    table.foreign('inventory_id').references('id').inTable('inventory').onDelete('RESTRICT');
    table.index(['inventory_id'], 'purchase_inventory_id_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('purchase', (table) => {
    table.dropForeign('inventory_id');
    table.dropIndex(['inventory_id'], 'purchase_inventory_id_index');
    table.dropColumn('inventory_id');
  });
}