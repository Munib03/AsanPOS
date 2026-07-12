import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.index(['store_id', 'deleted_at', 'name'], 'products_store_list_idx');
  });

  await knex.schema.alterTable('inventory', (table) => {
    table.index(['store_id', 'deleted_at', 'name'], 'inventory_store_list_idx');
  });

  await knex.schema.alterTable('stock_quantity', (table) => {
    table.index(
      ['inventory_id', 'quantity', 'id'],
      'stock_quantity_inventory_quantity_idx',
    );
    table.index(['product_id'], 'stock_quantity_product_idx');
  });

  await knex.schema.alterTable('sale', (table) => {
    table.index(['store_id', 'created_at'], 'sale_store_created_at_idx');
  });

  await knex.schema.alterTable('sale_items', (table) => {
    table.index(['sale_id'], 'sale_items_sale_idx');
    table.index(['product_id', 'sale_id'], 'sale_items_product_sale_idx');
  });

  await knex.schema.alterTable('purchase', (table) => {
    table.index(['store_id', 'created_at'], 'purchase_store_created_at_idx');
  });

  await knex.schema.alterTable('purchased_items', (table) => {
    table.index(['purchase_id'], 'purchased_items_purchase_idx');
    table.index(
      ['product_id', 'created_at'],
      'purchased_items_product_created_at_idx',
    );
  });

  await knex.schema.alterTable('store_session', (table) => {
    table.index(['store_id', 'opened_at'], 'store_session_store_opened_idx');
    table.index(['store_id', 'closed_at'], 'store_session_store_closed_idx');
  });

  await knex.schema.alterTable('payments', (table) => {
    table.index(['sale_id', 'store_session_id'], 'payments_sale_session_idx');
  });

  await knex.schema.alterTable('cash_movement', (table) => {
    table.index(
      ['store_session_id', 'created_at'],
      'cash_movement_session_created_at_idx',
    );
  });

  await knex.schema.alterTable('stock_in', (table) => {
    table.index(
      ['purchase_id', 'created_at'],
      'stock_in_purchase_created_at_idx',
    );
    table.index(['inventory_id'], 'stock_in_inventory_idx');
  });

  await knex.schema.alterTable('stock_out', (table) => {
    table.index(['sale_id', 'created_at'], 'stock_out_sale_created_at_idx');
    table.index(['inventory_id'], 'stock_out_inventory_idx');
  });

  await knex.schema.alterTable('receipt', (table) => {
    table.index(['store_id', 'created_at'], 'receipt_store_created_at_idx');
  });

  await knex.schema.alterTable('customer', (table) => {
    table.index(['store_id', 'deleted_at', 'name'], 'customer_store_list_idx');
  });

  await knex.schema.alterTable('audit_logging', (table) => {
    table.index(
      ['employee_id', 'created_at'],
      'audit_logging_employee_created_at_idx',
    );
    table.index(
      ['entity_id', 'created_at'],
      'audit_logging_entity_created_at_idx',
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('audit_logging', (table) => {
    table.dropIndex([], 'audit_logging_entity_created_at_idx');
    table.dropIndex([], 'audit_logging_employee_created_at_idx');
  });

  await knex.schema.alterTable('customer', (table) => {
    table.dropIndex([], 'customer_store_list_idx');
  });

  await knex.schema.alterTable('receipt', (table) => {
    table.dropIndex([], 'receipt_store_created_at_idx');
  });

  await knex.schema.alterTable('stock_out', (table) => {
    table.dropIndex([], 'stock_out_inventory_idx');
    table.dropIndex([], 'stock_out_sale_created_at_idx');
  });

  await knex.schema.alterTable('stock_in', (table) => {
    table.dropIndex([], 'stock_in_inventory_idx');
    table.dropIndex([], 'stock_in_purchase_created_at_idx');
  });

  await knex.schema.alterTable('cash_movement', (table) => {
    table.dropIndex([], 'cash_movement_session_created_at_idx');
  });

  await knex.schema.alterTable('payments', (table) => {
    table.dropIndex([], 'payments_sale_session_idx');
  });

  await knex.schema.alterTable('store_session', (table) => {
    table.dropIndex([], 'store_session_store_closed_idx');
    table.dropIndex([], 'store_session_store_opened_idx');
  });

  await knex.schema.alterTable('purchased_items', (table) => {
    table.dropIndex([], 'purchased_items_product_created_at_idx');
    table.dropIndex([], 'purchased_items_purchase_idx');
  });

  await knex.schema.alterTable('purchase', (table) => {
    table.dropIndex([], 'purchase_store_created_at_idx');
  });

  await knex.schema.alterTable('sale_items', (table) => {
    table.dropIndex([], 'sale_items_product_sale_idx');
    table.dropIndex([], 'sale_items_sale_idx');
  });

  await knex.schema.alterTable('sale', (table) => {
    table.dropIndex([], 'sale_store_created_at_idx');
  });

  await knex.schema.alterTable('stock_quantity', (table) => {
    table.dropIndex([], 'stock_quantity_product_idx');
    table.dropIndex([], 'stock_quantity_inventory_quantity_idx');
  });

  await knex.schema.alterTable('inventory', (table) => {
    table.dropIndex([], 'inventory_store_list_idx');
  });

  await knex.schema.alterTable('products', (table) => {
    table.dropIndex([], 'products_store_list_idx');
  });
}
