import { Knex } from 'knex';

exports.up = async function(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE attachments 
    ALTER COLUMN entity_type TYPE varchar(255)
  `);
};

exports.down = async function(knex: Knex): Promise<void> {
};