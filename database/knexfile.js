require('dotenv').config({ path: '../.env' });

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'customer_insights',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations',
    },
    pool: {
      min: 10,
      max: 50,
    },
  },
};
