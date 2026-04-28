import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('products');

  if (!exists) {
    await knex.schema.createTable('products', (table) => {
      table
        .uuid('id')
        .primary()
        .defaultTo(knex.raw('gen_random_uuid()'));

      table.string('name');
      table.string('scanner_id');
      table.decimal('price', 10, 2);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('products');

  if (exists) {
    await knex.schema.dropTable('products');
  }
}