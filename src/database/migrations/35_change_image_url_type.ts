export async function up(knex) {
  await knex.schema.alterTable('employees', (table) => {
    table.text('image_url').alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('employees', (table) => {
    table.string('image_url', 255).alter();
  });
}