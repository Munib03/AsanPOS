import { Knex } from "knex";

exports.up = function(knex: Knex) {
  return knex.schema.table('products', function(table) {
    table.renameColumn('qrcode', 'barcode');
  });
};

exports.down = function(knex: Knex) {
  return knex.schema.table('products', function(table) {
    table.renameColumn('barcode', 'qrcode');
  });
};