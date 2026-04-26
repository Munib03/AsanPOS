import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE entity_type_enum AS ENUM ('Employee', 'Product');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await knex.schema.alterTable('attachments', (table) => {
    table.specificType('entity_type', 'entity_type_enum').notNullable().defaultTo('Employee');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('attachments', (table) => {
    table.dropColumn('entity_type');
  });
  await knex.raw('DROP TYPE IF EXISTS entity_type_enum');
}