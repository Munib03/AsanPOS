exports.up = async function(knex: any): Promise<void> {
  await knex.schema.createTable('two_factor_auth', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    table.string('code').notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.dropTable('two_factor_auth');
};