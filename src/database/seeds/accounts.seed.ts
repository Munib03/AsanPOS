import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex("store_settings").first();
  if (existing) return;

  const inventoryAccountId = uuidv4();
  const storeSettingsId = uuidv4();

  await knex("accounts").insert({
    id: inventoryAccountId,
    name: "Inventory Account",
    type: "asset",
    created_at: knex.fn.now(),
  });

  await knex("store_settings").insert({
    id: storeSettingsId,
    default_account_id: inventoryAccountId,
    created_at: knex.fn.now(),
  });

  await knex("stores").update({ store_settings_id: storeSettingsId });
}