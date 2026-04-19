import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  const hasImageUrl = await knex.schema.hasColumn('employees', 'image_url');
  const hasFirstName = await knex.schema.hasColumn('employees', 'first_name');
  const hasLastName = await knex.schema.hasColumn('employees', 'last_name');
  const hasDob = await knex.schema.hasColumn('employees', 'dob');
  const hasGender = await knex.schema.hasColumn('employees', 'gender');

  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    if (!hasImageUrl) table.string('image_url').nullable();
    if (!hasFirstName) table.string('first_name').nullable();
    if (!hasLastName) table.string('last_name').nullable();
    if (!hasDob) table.date('dob').nullable();
    if (!hasGender) table.string('gender').nullable();
  });
};

exports.down = async function(knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.dropColumn('image_url');
    table.dropColumn('first_name');
    table.dropColumn('last_name');
    table.dropColumn('dob');
    table.dropColumn('gender');
  });
};