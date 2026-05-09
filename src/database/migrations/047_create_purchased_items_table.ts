import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable('purchased_items');

    if (!exists) {
        await knex.schema.createTable("purchased_items", (table: Knex.TableBuilder) => {
            table.uuid("id").primary().notNullable();
            table.uuid("purchase_id").notNullable().references("id").inTable("purchase").onDelete("CASCADE");
            table.uuid("warehouse_id").notNullable().references("id").inTable("inventory").onDelete("CASCADE");
            table.uuid("product_id").notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.integer("quantity").notNullable();
            table.decimal("unit_price", 10, 2).notNullable();
            table.string("status").notNullable().defaultTo("pending");
            table.timestamp("created_at").defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable("purchased_items");
    if (exists)
        await knex.schema.dropTableIfExists("purchased_items");
}