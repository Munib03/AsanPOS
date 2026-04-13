import 'dotenv/config';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Employee } from './src/database/entites/mployee.entity';
import { Store } from './src/database/entites/store.entity';
import { TwoFactorAuth } from './src/database/entites/twoFactorAuth.entity';
import { SecurityAction } from './src/database/entites/securityAction.entity';


const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  entities: [Employee, Store, TwoFactorAuth, SecurityAction],
  migrations: {
    path: './src/migrations',
    glob: '!(*.d).{js,ts}',
  },
  debug: true,
};

export default config;