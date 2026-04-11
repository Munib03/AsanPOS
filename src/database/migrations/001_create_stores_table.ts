const { knex } = require('knex');

exports.up = async function(knex: any): Promise<void> {
  await knex.schema.createTable('stores', (table: any) => {
    table.uuid('id').primary();
    table.string('name').notNullable();
    table.string('address').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.dropTable('stores');
};