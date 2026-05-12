import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
        table.timestamp("created_at").nullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
        table.dropColumn("created_at");
        table.dropColumn("updated_at");
    });
}