import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("employees", (table: Knex.TableBuilder) => {
    table.timestamp("deleted_at").nullable();
  });

  await knex.schema.alterTable("categories", (table: Knex.TableBuilder) => {
    table.timestamp("deleted_at").nullable();
  });

  await knex.schema.alterTable("inventory", (table: Knex.TableBuilder) => {
    table.timestamp("deleted_at").nullable();
  });

  await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
    table.timestamp("deleted_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("employees", (table: Knex.TableBuilder) => {
    table.dropColumn("deleted_at");
  });

  await knex.schema.alterTable("categories", (table: Knex.TableBuilder) => {
    table.dropColumn("deleted_at");
  });

  await knex.schema.alterTable("inventory", (table: Knex.TableBuilder) => {
    table.dropColumn("deleted_at");
  });

  await knex.schema.alterTable("customer", (table: Knex.TableBuilder) => {
    table.dropColumn("deleted_at");
  });
}