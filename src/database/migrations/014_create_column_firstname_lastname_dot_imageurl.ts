import { Knex } from 'knex';

exports.up = async function (knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.string('imageUrl').nullable();
    table.string('firstName').nullable();
    table.string('lastName').nullable();
    table.date('dob').nullable();

    table
      .enu('gender', ['male', 'female', 'other'], {
        useNative: true,
        enumName: 'employee_gender',
      })
      .nullable();
  });
};

exports.down = async function (knex: Knex): Promise<void> {
  await knex.schema.alterTable('employees', (table: Knex.TableBuilder) => {
    table.dropColumn('imageUrl');
    table.dropColumn('firstName');
    table.dropColumn('lastName');
    table.dropColumn('dob');
    table.dropColumn('gender');
  });


  await knex.raw('DROP TYPE IF EXISTS employee_gender');
};