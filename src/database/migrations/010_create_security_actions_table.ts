exports.up = async function(knex: any): Promise<void> {
  await knex.schema.createTable('security_actions', (table: any) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    table.string('action_type').notNullable();
    table.string('secret').nullable();
    table.timestamp('expires_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.dropTableIfExists('security_actions');
};