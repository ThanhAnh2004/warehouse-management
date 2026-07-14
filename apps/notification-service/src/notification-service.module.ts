import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationController } from './notification/notification.controller';
import { NotificationService } from './notification/notification.service';
import { Alert, AlertSchema } from './schemas/alert.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI_NOTIFICATION') || 'mongodb://localhost:27017/notification_db',
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Alert.name, schema: AlertSchema }])
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationServiceModule {}
