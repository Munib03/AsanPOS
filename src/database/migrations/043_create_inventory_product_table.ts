import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    const exist = await knex.schema.hasTable("inventory_product");

    if (!exist) {
        await knex.schema.createTable("inventory_product", (table: Knex.TableBuilder) => {
            table.uuid("id").primary().notNullable();
            table.uuid("product_id").notNullable().references("id").inTable("product").onDelete("CASCADE");
            table.uuid("inventory_id").notNullable().references("id").inTable("inventory").onDelete("CASCADE");
        });
    }
}


export async function down(knex: Knex): Promise<void> {
    const exist = await knex.schema.hasTable("inventory_product");

    if (exist)
        await knex.schema.dropTable("inventory_product");
}