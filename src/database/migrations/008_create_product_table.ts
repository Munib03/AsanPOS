import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name');
    table.decimal('price', 10, 2);
    table.text('barcode').nullable();

    table.uuid('store_id').nullable()
      .references('id').inTable('stores').onDelete('SET NULL');

    table.uuid('sequence_id').nullable()
      .references('id').inTable('sequence');

    table.timestamp('deleted_at').nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
};