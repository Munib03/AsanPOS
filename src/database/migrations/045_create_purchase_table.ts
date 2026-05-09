import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('purchase');

    if (!exists) {
        await knex.schema.createTable("purchase", (table: Knex.TableBuilder) => {
            table.uuid("id").primary().notNullable();
            table.increments("sequence_id").notNullable();
            table.uuid("customer_id").notNullable().references("id").inTable("customer").onDelete("CASCADE");
            table.datetime("custom_date").nullable();
            table.string("status").notNullable().defaultTo("pending");
            table.timestamp("created_at").defaultTo(knex.fn.now());
            table.timestamp("updated_at").defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable("purchase");
    if (exists)
        await knex.schema.dropTableIfExists("purchase");
}