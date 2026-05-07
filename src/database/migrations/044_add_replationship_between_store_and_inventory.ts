import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('inventory', 'store_id');

    if (!exists) {
        await knex.schema.alterTable('inventory', (table: Knex.TableBuilder) => {
            table.uuid('store_id').notNullable().references('id').inTable('store').onDelete('CASCADE');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasColumn('inventory', 'store_id');

    if (exists) {
        await knex.schema.alterTable('inventory', (table: Knex.TableBuilder) => {
            table.dropColumn('store_id');
        });
    }
}