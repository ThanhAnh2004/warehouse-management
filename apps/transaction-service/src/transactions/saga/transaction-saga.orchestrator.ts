import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { SagaInstance, SagaStatus, SagaType, SagaStepLog } from '../entities/saga-instance.entity';
import { Transaction, TransactionStatus, TransactionType } from '../entities/transaction.entity';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

const DEFAULT_WAREHOUSE = 'DEFAULT_WAREHOUSE';

@Injectable()
export class TransactionSagaOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(TransactionSagaOrchestrator.name);

  constructor(
    @InjectRepository(SagaInstance)
    private readonly sagaRepository: Repository<SagaInstance>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @Inject('INVENTORY_SERVICE') private readonly inventoryClient: ClientProxy,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  onModuleInit() {
    // Chạy phục hồi sau khi service khởi động 10s
    setTimeout(() => {
      this.recoverStuckSagas();
    }, 10000);

    // Định kỳ mỗi 2 phút rà soát các Saga bị treo do lỗi mạng hoặc crash
    setInterval(() => {
      this.recoverStuckSagas();
    }, 120000);
  }

  /**
   * Khởi chạy Saga cho một Transaction
   */
  async executeTransactionSaga(tx: Transaction): Promise<Transaction> {
    const saga = this.sagaRepository.create({
      transactionId: tx.id,
      sagaType: tx.type as unknown as SagaType,
      status: SagaStatus.IN_PROGRESS,
      currentStep: 'INITIAL',
      payload: {
        productId: tx.productId,
        type: tx.type,
        quantity: tx.quantity,
        locationFrom: tx.locationFrom,
        locationTo: tx.locationTo,
      },
      stepLogs: [
        {
          step: 'INITIAL',
          action: `Bắt đầu Saga điều phối giao dịch [${tx.type}] cho SP ${tx.productId}`,
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const savedSaga = await this.sagaRepository.save(saga);
    tx.sagaId = savedSaga.id;
    await this.transactionRepository.save(tx);

    this.logger.log(`[Saga ${savedSaga.id}] Started orchestrating ${tx.type} for Transaction ${tx.id}`);

    try {
      switch (tx.type) {
        case TransactionType.TRANSFER:
          await this.orchestrateTransfer(savedSaga, tx);
          break;
        case TransactionType.OUTBOUND:
          await this.orchestrateOutbound(savedSaga, tx);
          break;
        case TransactionType.INBOUND:
          await this.orchestrateInbound(savedSaga, tx);
          break;
        case TransactionType.ADJUSTMENT:
          await this.orchestrateAdjustment(savedSaga, tx);
          break;
        default:
          throw new Error(`Loại giao dịch không hỗ trợ: ${tx.type}`);
      }
    } catch (err: any) {
      this.logger.error(`[Saga ${savedSaga.id}] Unhandled error during orchestration: ${err.message}`);
    }

    // Trả về bản ghi transaction sau khi saga hoàn tất hoặc bù trừ xong
    const finalTx = await this.transactionRepository.findOne({ where: { id: tx.id } });
    const resultTx = finalTx || tx;

    // Phát sự kiện sang Apache Kafka khi giao dịch hoàn tất thành công (COMPLETED)
    if (resultTx.status === TransactionStatus.COMPLETED) {
      await this.publishKafkaEvent(resultTx, savedSaga);
    }

    return resultTx;
  }

  /**
   * Phát sự kiện giao dịch sang Apache Kafka (Topic: warehouse.transactions)
   * Sử dụng productId làm Partition Key để đảm bảo thứ tự thời gian cho từng sản phẩm
   */
  private async publishKafkaEvent(tx: Transaction, saga: SagaInstance): Promise<void> {
    try {
      const eventPayload = {
        eventId: saga.id,
        transactionId: tx.id,
        productId: tx.productId,
        type: tx.type,
        quantity: tx.quantity,
        locationFrom: tx.locationFrom,
        locationTo: tx.locationTo,
        status: tx.status,
        createdBy: tx.createdBy,
        note: tx.note,
        timestamp: tx.createdAt ? tx.createdAt.toISOString() : new Date().toISOString(),
      };

      await this.kafkaProducer.emit('warehouse.transactions', tx.productId, eventPayload);
    } catch (err: any) {
      this.logger.warn(`Could not emit Kafka event for transaction ${tx.id}: ${err.message}`);
    }
  }

  /**
   * SAGA CHUYỂN KHO (TRANSFER):
   * Bước 1: Trừ kho ở kệ nguồn (DEDUCT_SOURCE)
   * Bước 2: Cộng kho ở kệ đích (CREDIT_DEST)
   * Nếu Bước 2 thất bại -> Kích hoạt Bù trừ: Hoàn trả lại kệ nguồn (COMPENSATE_SOURCE)
   */
  private async orchestrateTransfer(saga: SagaInstance, tx: Transaction): Promise<void> {
    const { productId, quantity, locationFrom, locationTo } = tx;

    // --- BƯỚC 1: DEDUCT_SOURCE ---
    saga.currentStep = 'DEDUCT_SOURCE';
    try {
      await this.callInventoryUpdate(productId, -quantity, locationFrom);
      this.appendLog(saga, 'DEDUCT_SOURCE', `Đã trừ ${quantity} sản phẩm tại kệ nguồn [${locationFrom}]`, 'SUCCESS');
      await this.sagaRepository.save(saga);
    } catch (err: any) {
      const errMsg = err?.message || 'Trừ kho nguồn thất bại';
      this.appendLog(saga, 'DEDUCT_SOURCE', `Trừ kho nguồn [${locationFrom}] thất bại: ${errMsg}`, 'FAILED', errMsg);
      saga.status = SagaStatus.FAILED;
      saga.errorMessage = errMsg;
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.FAILED;
      tx.note = `${tx.note || ''} | [Saga]: Lỗi trừ kho nguồn: ${errMsg}`.trim();
      await this.transactionRepository.save(tx);
      return;
    }

    // --- BƯỚC 2: CREDIT_DEST ---
    saga.currentStep = 'CREDIT_DEST';
    try {
      await this.callInventoryUpdate(productId, quantity, locationTo);
      this.appendLog(saga, 'CREDIT_DEST', `Đã cộng ${quantity} sản phẩm tại kệ đích [${locationTo}]`, 'SUCCESS');
      saga.status = SagaStatus.COMPLETED;
      saga.currentStep = 'COMPLETED';
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(tx);
      this.logger.log(`[Saga ${saga.id}] TRANSFER completed successfully!`);
    } catch (destErr: any) {
      // BƯỚC 2 THẤT BẠI -> KÍCH HOẠT COMPENSATING TRANSACTION
      const destErrMsg = destErr?.message || 'Cộng kho đích thất bại';
      this.appendLog(saga, 'CREDIT_DEST', `Lỗi cộng kho đích [${locationTo}]: ${destErrMsg}`, 'FAILED', destErrMsg);
      saga.status = SagaStatus.COMPENSATING;
      saga.currentStep = 'COMPENSATE_SOURCE';
      await this.sagaRepository.save(saga);

      this.logger.warn(`[Saga ${saga.id}] Step 2 failed. Initiating COMPENSATING transaction for Step 1...`);

      try {
        await this.callInventoryUpdate(productId, quantity, locationFrom);
        this.appendLog(
          saga,
          'COMPENSATE_SOURCE',
          `Bù trừ thành công: Đã hoàn trả ${quantity} sản phẩm về lại kệ nguồn [${locationFrom}]`,
          'COMPENSATED',
        );
        saga.status = SagaStatus.COMPENSATED;
        saga.errorMessage = `Chuyển kho không thành công do đích [${locationTo}] lỗi. Đã tự động hoàn trả kệ nguồn.`;
        await this.sagaRepository.save(saga);

        tx.status = TransactionStatus.FAILED;
        tx.note = `${tx.note || ''} | [Saga]: Kệ đích [${locationTo}] lỗi (${destErrMsg}). Đã tự động bù trừ hoàn trả về kệ nguồn [${locationFrom}].`.trim();
        await this.transactionRepository.save(tx);
      } catch (compErr: any) {
        // Cực kỳ hiếm: Bù trừ thất bại (ví dụ inventory DB down hoàn toàn)
        const compErrMsg = compErr?.message || 'Hoàn tác thất bại';
        this.appendLog(
          saga,
          'COMPENSATE_SOURCE',
          `NGHIÊM TRỌNG: Hoàn trả về kệ nguồn [${locationFrom}] thất bại: ${compErrMsg}`,
          'FAILED',
          compErrMsg,
        );
        saga.status = SagaStatus.FAILED;
        saga.errorMessage = `CRITICAL: Chuyển kho thất bại VÀ bù trừ thất bại! Cần đối soát thủ công khẩn cấp. Lỗi đích: ${destErrMsg}. Lỗi bù trừ: ${compErrMsg}`;
        await this.sagaRepository.save(saga);

        tx.status = TransactionStatus.FAILED;
        tx.note = `${tx.note || ''} | [Saga CRITICAL]: Chuyển đích lỗi VÀ bù trừ lỗi, cần đối soát thủ công! Lỗi ở đích: ${destErrMsg}; Lỗi hoàn tác nguồn: ${compErrMsg}`.trim();
        await this.transactionRepository.save(tx);
      }
    }
  }

  /**
   * SAGA XUẤT KHO (OUTBOUND)
   */
  private async orchestrateOutbound(saga: SagaInstance, tx: Transaction): Promise<void> {
    const { productId, quantity, locationFrom } = tx;
    const loc = locationFrom || DEFAULT_WAREHOUSE;

    saga.currentStep = 'DEDUCT_OUTBOUND';
    try {
      await this.callInventoryUpdate(productId, -quantity, loc);
      this.appendLog(saga, 'DEDUCT_OUTBOUND', `Đã xuất ${quantity} sản phẩm từ kệ [${loc}]`, 'SUCCESS');
      saga.status = SagaStatus.COMPLETED;
      saga.currentStep = 'COMPLETED';
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(tx);
      this.logger.log(`[Saga ${saga.id}] OUTBOUND completed successfully!`);
    } catch (err: any) {
      const errMsg = err?.message || 'Xuất kho thất bại';
      this.appendLog(saga, 'DEDUCT_OUTBOUND', `Xuất kho từ [${loc}] thất bại: ${errMsg}`, 'FAILED', errMsg);
      saga.status = SagaStatus.FAILED;
      saga.errorMessage = errMsg;
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.FAILED;
      tx.note = `${tx.note || ''} | [Saga]: Xuất kho thất bại (${errMsg})`.trim();
      await this.transactionRepository.save(tx);
    }
  }

  /**
   * SAGA NHẬP KHO (INBOUND)
   */
  private async orchestrateInbound(saga: SagaInstance, tx: Transaction): Promise<void> {
    const { productId, quantity, locationTo } = tx;
    const loc = locationTo || DEFAULT_WAREHOUSE;

    saga.currentStep = 'CREDIT_INBOUND';
    try {
      await this.callInventoryUpdate(productId, quantity, loc);
      this.appendLog(saga, 'CREDIT_INBOUND', `Đã nhập ${quantity} sản phẩm vào kệ [${loc}]`, 'SUCCESS');
      saga.status = SagaStatus.COMPLETED;
      saga.currentStep = 'COMPLETED';
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(tx);
      this.logger.log(`[Saga ${saga.id}] INBOUND completed successfully!`);
    } catch (err: any) {
      const errMsg = err?.message || 'Nhập kho thất bại';
      this.appendLog(saga, 'CREDIT_INBOUND', `Nhập kho vào [${loc}] thất bại: ${errMsg}`, 'FAILED', errMsg);
      saga.status = SagaStatus.FAILED;
      saga.errorMessage = errMsg;
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.FAILED;
      tx.note = `${tx.note || ''} | [Saga]: Nhập kho thất bại (${errMsg})`.trim();
      await this.transactionRepository.save(tx);
    }
  }

  /**
   * SAGA KIỂM KÊ / ĐIỀU CHỈNH KHO (ADJUSTMENT)
   */
  private async orchestrateAdjustment(saga: SagaInstance, tx: Transaction): Promise<void> {
    const { productId, quantity, locationTo, locationFrom } = tx;
    const loc = locationTo || locationFrom || DEFAULT_WAREHOUSE;

    saga.currentStep = 'APPLY_ADJUSTMENT';
    try {
      await this.callInventoryUpdate(productId, quantity, loc);
      this.appendLog(saga, 'APPLY_ADJUSTMENT', `Đã điều chỉnh ${quantity > 0 ? '+' : ''}${quantity} tại kệ [${loc}]`, 'SUCCESS');
      saga.status = SagaStatus.COMPLETED;
      saga.currentStep = 'COMPLETED';
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(tx);
      this.logger.log(`[Saga ${saga.id}] ADJUSTMENT completed successfully!`);
    } catch (err: any) {
      const errMsg = err?.message || 'Điều chỉnh kho thất bại';
      this.appendLog(saga, 'APPLY_ADJUSTMENT', `Điều chỉnh tại [${loc}] thất bại: ${errMsg}`, 'FAILED', errMsg);
      saga.status = SagaStatus.FAILED;
      saga.errorMessage = errMsg;
      await this.sagaRepository.save(saga);

      tx.status = TransactionStatus.FAILED;
      tx.note = `${tx.note || ''} | [Saga]: Điều chỉnh kho thất bại (${errMsg})`.trim();
      await this.transactionRepository.save(tx);
    }
  }

  /**
   * Tự động phục hồi các Saga bị treo (Crash Recovery)
   */
  async recoverStuckSagas(): Promise<number> {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const stuckSagas = await this.sagaRepository.find({
      where: [
        { status: SagaStatus.IN_PROGRESS, updatedAt: LessThan(twoMinutesAgo) },
        { status: SagaStatus.COMPENSATING, updatedAt: LessThan(twoMinutesAgo) },
      ],
      take: 20,
    });

    if (stuckSagas.length === 0) return 0;

    this.logger.warn(`Found ${stuckSagas.length} stuck Sagas. Attempting crash recovery...`);
    let recoveredCount = 0;

    for (const saga of stuckSagas) {
      try {
        const tx = await this.transactionRepository.findOne({ where: { id: saga.transactionId } });
        if (!tx) {
          saga.status = SagaStatus.FAILED;
          saga.errorMessage = 'Transaction không tồn tại';
          await this.sagaRepository.save(saga);
          continue;
        }

        if (saga.status === SagaStatus.COMPENSATING || saga.currentStep === 'COMPENSATE_SOURCE') {
          // Tiếp tục bù trừ cho kệ nguồn
          this.logger.log(`[Crash Recovery] Resuming compensation for Saga ${saga.id}...`);
          await this.callInventoryUpdate(tx.productId, tx.quantity, tx.locationFrom);
          this.appendLog(saga, 'RECOVER_COMPENSATE', 'Phục hồi sau sự cố: Bù trừ thành công', 'COMPENSATED');
          saga.status = SagaStatus.COMPENSATED;
          await this.sagaRepository.save(saga);

          tx.status = TransactionStatus.FAILED;
          tx.note = `${tx.note || ''} | [Crash Recovery]: Đã tự động phục hồi bù trừ sau sự cố.`.trim();
          await this.transactionRepository.save(tx);
          recoveredCount++;
        }
      } catch (e: any) {
        saga.retryCount = (saga.retryCount || 0) + 1;
        this.logger.error(`[Crash Recovery] Failed to recover Saga ${saga.id}: ${e.message}`);
        await this.sagaRepository.save(saga);
      }
    }

    return recoveredCount;
  }

  // --- QUERY APIS FOR AUDIT & MONITORING ---
  async getSagaByTransactionId(transactionId: string): Promise<SagaInstance | null> {
    return this.sagaRepository.findOne({ where: { transactionId } });
  }

  async getSagaById(id: string): Promise<SagaInstance | null> {
    return this.sagaRepository.findOne({ where: { id } });
  }

  async getAllSagas(page = 1, limit = 20, status?: string): Promise<{ data: SagaInstance[]; total: number }> {
    const qb = this.sagaRepository.createQueryBuilder('s');
    if (status) {
      qb.where('s.status = :status', { status });
    }
    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  // Helper RPC
  private async callInventoryUpdate(productId: string, quantityChange: number, location: string) {
    return firstValueFrom(
      this.inventoryClient.send('inventory.update_stock', { productId, quantityChange, location }),
    );
  }

  // Helper log
  private appendLog(
    saga: SagaInstance,
    step: string,
    action: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'COMPENSATED',
    error?: string,
  ) {
    const log: SagaStepLog = {
      step,
      action,
      status,
      error,
      timestamp: new Date().toISOString(),
    };
    if (!Array.isArray(saga.stepLogs)) {
      saga.stepLogs = [];
    }
    saga.stepLogs.push(log);
  }
}
