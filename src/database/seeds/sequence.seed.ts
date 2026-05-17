import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

export async function seed(knex: Knex): Promise<void> {
  await knex("sequence").del();

  await knex("sequence").insert([
    {
      id: uuidv4(),
      entity: "StockIn",
      prefix: "PUR",
      last_index: 0,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
}