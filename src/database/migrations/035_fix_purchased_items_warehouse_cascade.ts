import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('purchased_items', (table) => {
        table.dropForeign('warehouse_id');
    });

    await knex.schema.alterTable('purchased_items', (table) => {
        table.uuid('warehouse_id').nullable().alter();
    });

    await knex.schema.alterTable('purchased_items', (table) => {
        table
            .foreign('warehouse_id')
            .references('id')
            .inTable('inventory')
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('purchased_items', (table) => {
        table.dropForeign('warehouse_id');
    });

    await knex.schema.alterTable('purchased_items', (table) => {
        table.uuid('warehouse_id').notNullable().alter();
    });

    await knex.schema.alterTable('purchased_items', (table) => {
        table
            .foreign('warehouse_id')
            .references('id')
            .inTable('inventory')
            .onDelete('CASCADE');
    });
}