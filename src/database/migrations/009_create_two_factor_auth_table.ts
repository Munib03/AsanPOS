exports.up = async function(knex: any): Promise<void> {
  await knex.schema.createTable('two_factor_auth', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    table.string('secret').notNullable();
    table.string('backup_code').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').nullable();
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.dropTableIfExists('two_factor_auth');
};