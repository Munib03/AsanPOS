exports.up = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.unique('email');
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.dropUnique('email');
  });
};