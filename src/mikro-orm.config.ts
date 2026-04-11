import 'dotenv/config';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Employee } from './database/entites/mployee.entity';
import { Store } from './database/entites/store.entity';
import { TwoFactorAuth } from './database/entites/twoFactorAuth.entity';

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