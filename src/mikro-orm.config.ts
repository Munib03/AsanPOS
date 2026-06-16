import 'dotenv/config';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Employee } from './database/entites/employee.entity';
import { Store } from './database/entites/store.entity';
import { TwoFactorAuth } from './database/entites/twoFactorAuth.entity';
import { SecurityAction } from './database/entites/securityAction.entity';
import { Category } from './database/entites/category.entity';
import { Product } from './database/entites/product.entity';
import { ProductImage } from './database/entites/product-image.entity';
import { Attachment } from './database/entites/attachment.entity';
import { Inventory } from './database/entites/inventory.entity';
import { Customer } from './database/entites/customer.entity';
import { StockIn } from './database/entites/stock-in.entity';
import { StockInItem } from './database/entites/stock-in-item.entity';
import { PurchasedItem } from './database/entites/purchased_item.entity';
import { StockQuantity } from './database/entites/stock-quantity.entity';
import { Sequence } from './database/entites/sequence.entity';
import { JournalEntry } from './database/entites/journal-entry.entity';
import { JournalEntryItem } from './database/entites/journal-entry-item.entity';
import { Sale } from './database/entites/sale.entity';
import { SaleItem } from './database/entites/sale-item.entity';
import { StockOut } from './database/entites/stock-out.entity';
import { StockOutItem } from './database/entites/stock-out-item.entity';
import { AuditLog } from './database/entites/audit-log.entity';
import { CashMovement } from './database/entites/cash-movement.entity';
import { Payment } from './database/entites/payments.entity';
import { StoreSession } from './database/entites/store-session.entity';


const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  entities: [Employee, Store, TwoFactorAuth, SecurityAction, Category, 
             Product, ProductImage, Attachment, Inventory, Customer, 
             StockIn, StockInItem, PurchasedItem, StockQuantity, Sequence, JournalEntry, 
             JournalEntryItem, Sale, SaleItem, StockOut, StockOutItem, AuditLog, CashMovement, StoreSession, Payment],
  migrations: {
    path: './src/database/migrations',
    glob: '!(*.d).{js,ts}',
  },
  debug: true,
};

export default config;