import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InventoryController } from './inventory/inventory.controller';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [AppController, AuthController, UsersController, InventoryController],
  providers: [AppService],
})
export class AppModule { }