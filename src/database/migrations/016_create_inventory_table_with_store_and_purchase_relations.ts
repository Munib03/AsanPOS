import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('address').notNullable();
    table.uuid('store_id').notNullable()
      .references('id').inTable('stores').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('purchase', (table: Knex.TableBuilder) => {
    table.uuid('inventory_id').nullable();
    table.foreign('inventory_id').references('id').inTable('inventory').onDelete('RESTRICT');
    table.index(['inventory_id'], 'purchase_inventory_id_index');
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('purchase', (table: Knex.TableBuilder) => {
    table.dropForeign('inventory_id');
    table.dropIndex(['inventory_id'], 'purchase_inventory_id_index');
    table.dropColumn('inventory_id');
  });

  await knex.schema.dropTableIfExists('inventory');
};