import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('customer', 'store_id');

    if (!exists) {
        await knex.schema.alterTable('customer', (table) => {
            table.uuid('store_id').nullable().references('id').inTable('stores').onDelete('CASCADE');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('customer', 'store_id');

    if (exists) {
        await knex.schema.alterTable('customer', (table) => {
            table.dropColumn('store_id');
        });
    }
}