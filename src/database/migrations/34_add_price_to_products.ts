import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasPrice = await knex.schema.hasColumn('products', 'price');
  const hasCatId = await knex.schema.hasColumn('products', 'cat_id');

  await knex.schema.alterTable('products', (table) => {
    if (!hasPrice) {
      table.decimal('price', 10, 2).nullable();
    }

    if (hasCatId) {
      table.dropColumn('cat_id');
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasPrice = await knex.schema.hasColumn('products', 'price');
  const hasCatId = await knex.schema.hasColumn('products', 'cat_id');

  await knex.schema.alterTable('products', (table) => {
    if (hasPrice) {
      table.dropColumn('price');
    }

    if (!hasCatId) {
      table.uuid('cat_id').nullable();
    }
  });
}