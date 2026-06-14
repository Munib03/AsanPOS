import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasScannerIdColumn = await knex.schema.hasColumn('products', 'scanner_id');
  const hasQrcodeColumn = await knex.schema.hasColumn('products', 'qrcode');
  const hasBarcodeColumn = await knex.schema.hasColumn('products', 'barcode');

  if (hasScannerIdColumn) {
    await knex.schema.table('products', (table) => {
      table.renameColumn('scanner_id', 'barcode');
    });
    await knex.schema.table('products', (table) => {
      table.text('barcode').alter();
    });
  }

  if (hasQrcodeColumn) {
    await knex.schema.table('products', (table) => {
      table.renameColumn('qrcode', 'barcode');
    });
  }

  if (!hasBarcodeColumn && !hasScannerIdColumn && !hasQrcodeColumn) {
    await knex.schema.table('products', (table) => {
      table.text('barcode');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasBarcodeColumn = await knex.schema.hasColumn('products', 'barcode');

  if (hasBarcodeColumn) {
    await knex.schema.table('products', (table) => {
      table.renameColumn('barcode', 'qrcode');
    });
  }
}