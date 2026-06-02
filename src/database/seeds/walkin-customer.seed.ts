import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export async function seed(knex: Knex): Promise<void> {
  const stores = await knex('stores').select('id');

  for (const store of stores) {
    const existing = await knex('customer')
      .where({ store_id: store.id, name: 'Walk-in Customer' })
      .first();

    if (existing) continue;

    const payableId = uuidv4();

    await knex('accounts').insert([
      {
        id: payableId,
        name: 'Walk-in Customer - Accounts Payable',
        type: 'liability',
        created_at: knex.fn.now(),
      },
    ]);

    await knex('customer').insert({
      id: uuidv4(),
      store_id: store.id,
      name: 'Walk-in Customer',
      phone: '0000000000',
      address: 'N/A',
      payable_id: payableId,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
}
