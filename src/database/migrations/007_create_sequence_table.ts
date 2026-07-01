import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("sequence", (table: Knex.TableBuilder) => {
        table.uuid("id").primary().notNullable();
        table.string("entity").notNullable();
        table.string("prefix").notNullable();
        table.integer("last_index").notNullable();
        table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("sequence");

}