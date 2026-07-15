import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sequence', (table) => {
    table
      .uuid('store_id')
      .nullable()
      .references('id')
      .inTable('stores')
      .onDelete('RESTRICT');
    table.unique(
      ['store_id', 'entity', 'last_index'],
      'sequence_store_entity_last_index_unique',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sequence', (table) => {
    table.dropUnique(
      ['store_id', 'entity', 'last_index'],
      'sequence_store_entity_last_index_unique',
    );
    table.dropColumn('store_id');
  });
}
