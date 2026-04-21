import { Knex } from "knex";


exports.up = async function(knex: Knex): Promise<void> {
    await knex.schema.createTable("products", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.string("name").notNullable();
        table.uuid("cat_id").nullable().references("id").inTable("categories").onDelete("SET NULL");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
};

exports.down = async function(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("products");
};