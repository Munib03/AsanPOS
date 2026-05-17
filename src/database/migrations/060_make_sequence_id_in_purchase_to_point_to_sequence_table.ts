import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.dropColumn("sequence_id");
  });

  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.uuid("sequence_id").nullable().references("id").inTable("sequence");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.dropColumn("sequence_id");
  });

  await knex.schema.alterTable("purchase", (table: Knex.TableBuilder) => {
    table.integer("sequence_id").nullable();
  });
}