import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.renameColumn('imageUrl', 'image_url');
    table.renameColumn('firstName', 'first_name');
    table.renameColumn('lastName', 'last_name');
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table) => {
    table.renameColumn('image_url', 'imageUrl');
    table.renameColumn('first_name', 'firstName');
    table.renameColumn('last_name', 'lastName');
  });
};