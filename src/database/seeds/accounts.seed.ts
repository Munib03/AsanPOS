import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex("accounts").where("name", "Inventory Account").first();
  if (existing) return;

  const inventoryAccountId = uuidv4();
  const payableAccountId = uuidv4();
  const storeSettingsId = uuidv4();

  await knex("accounts").insert([
    {
      id: inventoryAccountId,
      name: "Inventory Account",
      type: "asset",
      created_at: knex.fn.now(),
    },
    {
      id: payableAccountId,
      name: "Accounts Payable",
      type: "liability",
      created_at: knex.fn.now(),
    },
  ]);

  await knex("store_settings").insert({
    id: storeSettingsId,
    default_account_id: inventoryAccountId,
    created_at: knex.fn.now(),
  });

  await knex("stores").update({ store_settings_id: storeSettingsId });
  await knex("customer").update({ payable_id: payableAccountId });
}