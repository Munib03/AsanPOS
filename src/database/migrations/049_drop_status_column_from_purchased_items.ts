import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('purchased_items', 'status');

    if (exists) {
        await knex.schema.alterTable('purchased_items', (table) => {
            table.dropColumn('status');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('purchased_items', 'status');

    if (!exists) {
        await knex.schema.alterTable('purchased_items', (table) => {
            table.string('status').notNullable().defaultTo('pending');
        });
    }
}