import { Knex } from "knex";

exports.up = async function(knex: Knex) {
  await knex.schema.table('products', function(table) {
    table.renameColumn('scanner_id', 'qrcode');
  });

  await knex.schema.table('products', function(table) {
    table.text('qrcode').alter();
  });
};

exports.down = async function(knex: Knex) {
  await knex.schema.table('products', function(table) {
    table.string('qrcode').alter();
  });

  await knex.schema.table('products', function(table) {
    table.renameColumn('qrcode', 'scanner_id');
  });
};