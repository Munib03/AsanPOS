import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('two_factor_auth');

  if (!exists) {
    await knex.schema.createTable('two_factor_auth', (table: Knex.TableBuilder) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('employee_id').notNullable()
        .references('id').inTable('employees').onDelete('CASCADE');
      table.string('secret').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at').nullable();
    });
  }
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('two_factor_auth');
};