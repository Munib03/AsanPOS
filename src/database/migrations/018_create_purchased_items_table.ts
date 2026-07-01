import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
    await knex.schema.createTable('purchased_items', (table: Knex.TableBuilder) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('purchase_id').notNullable()
            .references('id').inTable('purchase').onDelete('CASCADE');
        table.uuid('warehouse_id').notNullable()
            .references('id').inTable('inventory').onDelete('CASCADE');
        table.uuid('product_id').notNullable()
            .references('id').inTable('products').onDelete('CASCADE');
        table.integer('quantity').notNullable();
        table.decimal('unit_price', 10, 2).notNullable();
        table.decimal('received', 10, 2).nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = async function (knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('purchased_items');
};