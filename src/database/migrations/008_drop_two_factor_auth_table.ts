exports.up = async function(knex: any): Promise<void> {
  await knex.schema.dropTableIfExists('two_factor_auth');
};

exports.down = async function(knex: any): Promise<void> {
};