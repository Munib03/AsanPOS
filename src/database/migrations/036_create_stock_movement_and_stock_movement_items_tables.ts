import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('stock_movement', (table) => {
        table.uuid('id').primary();
        table.uuid('source_inventory_id').notNullable()
            .references('id').inTable('inventory').onDelete('RESTRICT');
        table.uuid('destination_inventory_id').notNullable()
            .references('id').inTable('inventory').onDelete('RESTRICT');
        table.string('status').notNullable().defaultTo('draft');
        table.uuid('sequence_id')
            .references('id').inTable('sequence').onDelete('RESTRICT');
        table.uuid('store_id').notNullable()
            .references('id').inTable('stores').onDelete('RESTRICT');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').nullable();
    });

    await knex.schema.createTable('stock_movement_items', (table) => {
        table.uuid('id').primary();
        table.uuid('stock_movement_id').notNullable()
            .references('id').inTable('stock_movement').onDelete('RESTRICT');
        table.uuid('product_id').notNullable()
            .references('id').inTable('products').onDelete('RESTRICT');
        table.decimal('quantity', 10, 2).notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('stock_movement_items');
    await knex.schema.dropTableIfExists('stock_movement');
}