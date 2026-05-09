import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('purchase', 'customer_date');

    if (exists) {
        await knex.schema.alterTable('purchase', (table) => {
            table.renameColumn('customer_date', 'custom_date');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('purchase', 'custom_date');

    if (exists) {
        await knex.schema.alterTable('purchase', (table) => {
            table.renameColumn('custom_date', 'customer_date');
        });
    }
}