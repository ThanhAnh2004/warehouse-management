import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const broker = this.configService.get<string>('KAFKA_BROKER', 'localhost:9092');
    this.kafka = new Kafka({
      clientId: 'warehouse-transaction-service',
      brokers: [broker],
      logLevel: logLevel.WARN,
      retry: {
        retries: 3,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
    });
  }

  async onModuleInit() {
    this.connectProducer();
  }

  private async connectProducer() {
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log(`Successfully connected to Apache Kafka broker.`);
    } catch (err: any) {
      this.isConnected = false;
      this.logger.warn(`Kafka broker at ${this.configService.get<string>('KAFKA_BROKER', 'localhost:9092')} is not yet reachable (${err.message}). Service will continue running and auto-reconnect.`);
    }
  }

  /**
   * Phát sự kiện vào Topic Kafka kèm Partition Key
   * @param topic Tên topic (ví dụ: 'warehouse.transactions')
   * @param key Partition Key (ví dụ: productId để bảo toàn thứ tự cho từng mặt hàng)
   * @param value Dữ liệu payload
   */
  async emit(topic: string, key: string, value: any): Promise<boolean> {
    if (!this.isConnected) {
      try {
        await this.producer.connect();
        this.isConnected = true;
      } catch (e: any) {
        this.logger.warn(`Kafka broker unavailable: skipping event publication to topic [${topic}].`);
        return false;
      }
    }

    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: String(key),
            value: typeof value === 'string' ? value : JSON.stringify(value),
            timestamp: Date.now().toString(),
          },
        ],
      });
      this.logger.log(`[Kafka Emit] Published event to topic [${topic}] with Partition Key [${key}]`);
      return true;
    } catch (err: any) {
      this.logger.error(`[Kafka Error] Failed to publish message to topic [${topic}]: ${err.message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      try {
        await this.producer.disconnect();
        this.logger.log('Disconnected from Apache Kafka broker.');
      } catch (err: any) {
        this.logger.error(`Error disconnecting Kafka producer: ${err.message}`);
      }
    }
  }
}
