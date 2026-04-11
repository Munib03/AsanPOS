exports.up = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.renameColumn('username', 'name');
  });
};

exports.down = async function(knex: any): Promise<void> {
  await knex.schema.alterTable('employees', (table: any) => {
    table.renameColumn('name', 'username');
  });
};