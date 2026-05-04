import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('inventory');

    if (!exists) {
        await knex.schema.createTable('inventory', (table: Knex.TableBuilder) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.string('name').notNullable();
            table.string('address').notNullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo('now()');
        });
    }
};

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('inventory');

    if (exists)
        await knex.schema.dropTableIfExists('inventory');
};