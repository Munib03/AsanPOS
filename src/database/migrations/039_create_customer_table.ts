import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('customer');

    if (!exists) {
        await knex.schema.createTable("cutomer", (table: Knex.TableBuilder) => {
            table.uuid("id").primary().notNullable();
            table.string("name").notNullable();
            table.string("address").notNullable();
            // table.timestamp('created_at').defaultTo(knex.fn.now());
            // table.timestamp('updated_at').defaultTo('now()');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable("customer");

    if (exists)
        await knex.schema.dropTableIfExists("customer");
}