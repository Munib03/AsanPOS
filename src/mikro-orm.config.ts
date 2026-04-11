import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Employee } from './entites/Employee';
import { Store } from './entites/Store';
import { TwoFactorAuth } from './entites/TwoFactorAuth';
import * as dotenv from 'dotenv';
dotenv.config();

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  entities: [Employee, Store, TwoFactorAuth],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
  },
  debug: true,
};

export default config;