import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const hasInventoryId = await knex.schema.hasColumn('purchase', 'inventory_id');
    if (!hasInventoryId) {
        await knex.schema.alterTable('purchase', (table) => {
            table.uuid('inventory_id').notNullable().references('id').inTable('inventory').onDelete('CASCADE');
        });
    }

    const hasWarehouseId = await knex.schema.hasColumn('purchased_items', 'warehouse_id');
    if (hasWarehouseId) {
        await knex.schema.alterTable('purchased_items', (table) => {
            table.dropColumn('warehouse_id');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const hasInventoryId = await knex.schema.hasColumn('purchase', 'inventory_id');
    if (hasInventoryId) {
        await knex.schema.alterTable('purchase', (table) => {
            table.dropColumn('inventory_id');
        });
    }

    const hasWarehouseId = await knex.schema.hasColumn('purchased_items', 'warehouse_id');
    if (!hasWarehouseId) {
        await knex.schema.alterTable('purchased_items', (table) => {
            table.uuid('warehouse_id').notNullable().references('id').inTable('inventory').onDelete('CASCADE');
        });
    }
}