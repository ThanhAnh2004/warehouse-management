import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InventoryController } from './inventory/inventory.controller';
import { TransactionsController } from './transactions/transactions.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { ReportsController } from './reports/reports.controller';
import { AdminController } from './admin/admin.controller';
import { SystemController } from './system/system.controller';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'public'),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        // Use in-memory cache instead of Redis to prevent ECONNREFUSED
      }),
    }),
    // Import ConfigModule để đọc file .env ở thư mục gốc
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Đăng ký Client Auth Service bất đồng bộ để dùng ConfigService đọc env
    ClientsModule.registerAsync([
      {
        name: 'IDENTITY_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('IDENTITY_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('IDENTITY_SERVICE_PORT', 8001),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'INVENTORY_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('INVENTORY_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('INVENTORY_SERVICE_PORT', 8002),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'TRANSACTION_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('TRANSACTION_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('TRANSACTION_SERVICE_PORT', 8003),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'NOTIFICATION_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('NOTIFICATION_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('NOTIFICATION_SERVICE_PORT', 3004),
          },
        }),
        inject: [ConfigService],
      },
      {
        name: 'REPORTING_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('REPORTING_SERVICE_HOST', 'localhost'),
            port: configService.get<number>('REPORTING_SERVICE_PORT', 3005),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AppController, AuthController, UsersController, InventoryController, TransactionsController, NotificationsController, ReportsController, AdminController, SystemController],
  providers: [AppService],
})
export class AppModule { }