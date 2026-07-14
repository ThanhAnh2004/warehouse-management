import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ReportingServiceController } from './reporting-service.controller';
import { ReportingServiceService } from './reporting-service.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'INVENTORY_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('INVENTORY_SERVICE_HOST', '127.0.0.1'),
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
            host: configService.get<string>('TRANSACTION_SERVICE_HOST', '127.0.0.1'),
            port: configService.get<number>('TRANSACTION_SERVICE_PORT', 8003),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [ReportingServiceController],
  providers: [ReportingServiceService],
})
export class ReportingServiceModule {}
