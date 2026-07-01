import { Knex } from 'knex';


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("stock_quantity", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().notNullable();
        table.uuid("inventory_id").notNullable().references("id").inTable("inventory").onDelete("CASCADE");
        table.uuid("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
        table.decimal("quantity", 10, 2).nullable();
        table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("stock_quantity");
}