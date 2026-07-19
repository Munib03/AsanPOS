import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasThreadTable = await knex.schema.hasTable('ai_chat_thread');
  if (!hasThreadTable) {
    await knex.schema.createTable('ai_chat_thread', (table) => {
      table.uuid('id').primary();
      table.uuid('store_id').notNullable().references('id').inTable('stores');
      table
        .uuid('employee_id')
        .notNullable()
        .references('id')
        .inTable('employees');
      table.string('title').nullable();
      table.timestamp('last_message_at').nullable();
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').nullable();
      table.timestamp('deleted_at').nullable();

      table.index(['store_id']);
      table.index(['employee_id']);
      table.index(['store_id', 'employee_id']);
      table.index(['last_message_at']);
    });
  }

  const hasMessageTable = await knex.schema.hasTable('ai_chat_message');
  if (!hasMessageTable) {
    await knex.schema.createTable('ai_chat_message', (table) => {
      table.uuid('id').primary();
      table
        .uuid('thread_id')
        .notNullable()
        .references('id')
        .inTable('ai_chat_thread')
        .onDelete('CASCADE');
      table.string('role').notNullable();
      table.text('content').notNullable();
      table.string('status').nullable();
      table.text('error_message').nullable();
      table.string('model').nullable();
      table.string('provider').nullable();
      table.json('metadata').nullable();
      table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').nullable();

      table.index(['thread_id']);
      table.index(['thread_id', 'created_at']);
      table.index(['role']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_chat_message');
  await knex.schema.dropTableIfExists('ai_chat_thread');
}
