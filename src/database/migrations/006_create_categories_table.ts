import { Knex } from "knex";


exports.up = async function(knex: Knex): Promise<void> {
    await knex.schema.createTable("categories", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.string("name").notNullable();
        table.timestamp("created_At").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
};

exports.down = async function(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("categories");
};