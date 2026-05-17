import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("stock_in", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().notNullable();
        table.uuid("inventory_id").notNullable().references("id").inTable("inventory").onDelete("CASCADE");
        table.uuid("purchase_id").notNullable().references("id").inTable("purchase").onDelete("CASCADE");
        table.uuid("sequence_id").notNullable().references("id").inTable("sequence").onDelete("CASCADE");
        table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("stock_in");
}