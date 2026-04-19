import { Knex } from "knex";


exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('employees', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').notNullable().unique();
    table.string('name').notNullable();
    table.string('password').notNullable();
    table.string('phone').nullable();
    table.string('title').nullable();
    table.timestamp('verified_at').nullable();
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTable('employees');
};