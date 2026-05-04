import { Knex } from "knex";

exports.seed = async function(knex: Knex): Promise<void> {
  await knex('stores').del();

  await knex('stores').insert([
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Main Store',
      address: '123 Main Street',
    }
  ]);
};