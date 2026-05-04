import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('products', 'store_id');
  if (!hasColumn) {
    await knex.schema.alterTable('products', (table: Knex.TableBuilder) => {
      table.uuid('store_id').nullable().references('id').inTable('stores').onDelete('SET NULL');
    });
  }
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table: Knex.TableBuilder) => {
    table.dropColumn('store_id');
  });
};