import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // await knex.schema.alterTable("customer", (table) => {
  //   table.string("phone").nullable().alter();
  // });
}

export async function down(knex: Knex): Promise<void> {
  // await knex.schema.alterTable("customer", (table) => {
  //   table.string("phone").notNullable().alter();
  // });
}