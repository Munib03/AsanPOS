import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('inventory', 'store_id');

  if (!hasColumn) {
    await knex.schema.alterTable('inventory', (table: Knex.TableBuilder) => {
      table.uuid('store_id').notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('inventory', 'store_id');

  if (hasColumn) {
    await knex.schema.alterTable('inventory', (table: Knex.TableBuilder) => {
      table.dropColumn('store_id');
    });
  }
}