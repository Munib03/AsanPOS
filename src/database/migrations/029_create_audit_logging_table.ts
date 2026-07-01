import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logging', (table: Knex.TableBuilder) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('employee_id').notNullable()
      .references('id').inTable('employees');
    table.json('before').nullable();
    table.json('after').nullable();
    table.string('entity_type').notNullable();
    table.uuid('entity_id').nullable();
    table.string('action_type').nullable();
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logging');
};