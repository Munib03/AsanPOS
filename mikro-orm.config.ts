import 'dotenv/config';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,

  entities: ['dist/database/entites/**/*.entity.js'],
  entitiesTs: ['src/database/entites/**/*.entity.ts'],

  migrations: {
    path: './src/database/migrations',
    glob: '!(*.d).{js,ts}',
  },

  debug: true,
};

export default config;