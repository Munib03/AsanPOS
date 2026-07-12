import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasName = await knex.schema.hasColumn('employees', 'name');
  const hasFirstName = await knex.schema.hasColumn('employees', 'first_name');
  const hasLastName = await knex.schema.hasColumn('employees', 'last_name');

  if (hasName && hasFirstName && hasLastName) {
    await knex.raw(`
      update employees
      set
        first_name = coalesce(nullif(trim(first_name), ''), split_part(trim(name), ' ', 1)),
        last_name = coalesce(
          nullif(trim(last_name), ''),
          nullif(trim(regexp_replace(trim(name), '^\\S+\\s*', '')), ''),
          ''
        )
    `);
  }

  if (hasFirstName) {
    await knex.raw(`
      update employees
      set first_name = ''
      where first_name is null
    `);
    await knex.raw(
      'alter table employees alter column first_name set not null',
    );
  }

  if (hasLastName) {
    await knex.raw(`
      update employees
      set last_name = ''
      where last_name is null
    `);
    await knex.raw('alter table employees alter column last_name set not null');
  }

  if (hasName) {
    await knex.schema.alterTable('employees', (table) => {
      table.dropColumn('name');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasName = await knex.schema.hasColumn('employees', 'name');

  if (!hasName) {
    await knex.schema.alterTable('employees', (table) => {
      table.string('name').nullable();
    });
  }

  await knex.raw(`
    update employees
    set name = nullif(trim(concat_ws(' ', first_name, last_name)), '')
  `);
  await knex.raw(`
    update employees
    set name = email
    where name is null
  `);
  await knex.raw('alter table employees alter column name set not null');

  await knex.raw('alter table employees alter column first_name drop not null');
  await knex.raw('alter table employees alter column last_name drop not null');
}
