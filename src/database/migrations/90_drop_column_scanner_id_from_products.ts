import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn("products", "scanner_id");
  if (hasColumn) {
    await knex.schema.alterTable("products", (table: Knex.TableBuilder) => {
      table.dropColumn("scanner_id");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("products", (table: Knex.TableBuilder) => {
    table.string("scanner_id").nullable();
  });
}