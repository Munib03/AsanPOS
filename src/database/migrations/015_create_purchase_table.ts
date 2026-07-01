import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
    await knex.schema.createTable('purchase', (table: Knex.TableBuilder) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('customer_id').notNullable()
            .references('id').inTable('customer').onDelete('CASCADE');
        table.datetime('custom_date').nullable();
        table.string('status').notNullable().defaultTo('pending');
        table.uuid('store_id').nullable().references('id').inTable('stores');
        table.uuid('sequence_id').nullable().references('id').inTable('sequence');
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
};

exports.down = async function (knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('purchase');
};