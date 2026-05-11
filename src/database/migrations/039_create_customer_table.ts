import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('customer');

    if (!exists) {
        await knex.schema.createTable("customer", (table: Knex.TableBuilder) => {
            table.uuid("id").primary().notNullable();
            table.string("name").notNullable();
            table.string("address").notNullable();
            table.string("phone").nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable("customer");

    if (exists)
        await knex.schema.dropTableIfExists("customer");
}