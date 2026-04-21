import 'dotenv/config';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Employee } from './database/entites/employee.entity';
import { Store } from './database/entites/store.entity';
import { TwoFactorAuth } from './database/entites/twoFactorAuth.entity';
import { SecurityAction } from './database/entites/securityAction.entity';
import { Category } from './database/entites/category.entity';
import { Product } from './database/entites/product.entity';


const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  entities: [Employee, Store, TwoFactorAuth, SecurityAction, Category, Product],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
  },
  debug: true,
};

export default config;


