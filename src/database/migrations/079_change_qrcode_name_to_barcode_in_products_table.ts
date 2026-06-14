import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasQrcode = await knex.schema.hasColumn('products', 'qrcode');
  const hasBarcode = await knex.schema.hasColumn('products', 'barcode');

  if (hasQrcode && !hasBarcode) {
    await knex.schema.table('products', (table) => {
      table.renameColumn('qrcode', 'barcode');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasBarcode = await knex.schema.hasColumn('products', 'barcode');
  const hasQrcode = await knex.schema.hasColumn('products', 'qrcode');

  if (hasBarcode && !hasQrcode) {
    await knex.schema.table('products', (table) => {
      table.renameColumn('barcode', 'qrcode');
    });
  }
}