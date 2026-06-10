exports.up = function(knex) {
  return knex.schema.table('products', function(table) {
    table.uuid('sequence_id').nullable().references('id').inTable('sequence');
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', function(table) {
    table.dropColumn('sequence_id');
  });
};