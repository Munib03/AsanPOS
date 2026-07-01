import { Knex } from 'knex';


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("stock_in_items", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().notNullable();
        table.uuid("stock_in_id").notNullable().references("id").inTable("stock_in").onDelete("CASCADE");
        table.uuid("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
        table.uuid("purchased_item_id").notNullable().references("id").inTable("purchased_items").onDelete("CASCADE");
        table.decimal("quantity", 10, 2).notNullable();
        table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("stock_in_items");
}