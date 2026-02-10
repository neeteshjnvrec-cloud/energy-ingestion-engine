
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config(); 


// This ensures it looks in the correct root directory regardless of where it's run
dotenv.config({ path: path.resolve(__dirname, '../.env') }); 
console.log('Connecting to Host:', process.env.DATABASE_HOST);

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
  
  // 2. SSL IS REQUIRED FOR AIVEN
  ssl: {
    rejectUnauthorized: false, // Allows connection to Aiven without the local .pem file
  },

  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10), // Aiven Free tier limit is ~25
    min: parseInt(process.env.DATABASE_POOL_MIN ?? '2', 10),
    statement_timeout: 30000,
    query_timeout: 30000,
  },
};

export const dataSourceOptions: DataSourceOptions = {
  ...typeOrmConfig as DataSourceOptions,
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
