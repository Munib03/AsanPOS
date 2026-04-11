exports.up = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.string('email').notNullable().defaultTo('');
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.dropColumn('email');
  });
};