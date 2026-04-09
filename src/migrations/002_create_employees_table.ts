exports.up = async function(knex: any): Promise<void> {
  await knex.schema.createTable('employees', (table: any) => {
    table.uuid('id').primary();
    table.string('username').notNullable();
    table.string('password').notNullable();
    table.string('phone').notNullable();
    table.timestamp('verified_at').nullable();
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.dropTable('employees');
};