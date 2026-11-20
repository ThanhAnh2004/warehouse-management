import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionStatus, TransactionType } from './entities/transaction.entity';
import { SagaInstance, SagaStatus, SagaType } from './entities/saga-instance.entity';
import { Inventory } from '../stock/entities/inventory.entity';
import { Product } from '../products/entities/product.entity';
import { Location } from '../stock/entities/location.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

const DEFAULT_WAREHOUSE = 'A1-L1';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(SagaInstance)
    private readonly sagaRepository: Repository<SagaInstance>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Tạo giao dịch kho với bảo đảm toàn vẹn dữ liệu ACID trong cùng 1 Database context.
   * Không còn cần Saga bù trừ phân tán - nếu có bất kỳ lỗi nào, DB tự động ROLLBACK.
   */
  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    this.validateBusinessRules(createTransactionDto);

    return await this.dataSource.transaction(async (manager) => {
      const { type, productId, quantity, locationFrom, locationTo, createdBy, note } = createTransactionDto;

      // 1. Kiểm tra sản phẩm tồn tại
      const product = await manager.findOne(Product, { where: { id: productId } });
      if (!product) {
        throw new RpcException(`Sản phẩm với ID [${productId}] không tồn tại.`);
      }

      const nowStr = new Date().toISOString();
      const stepLogs = [
        {
          step: 'INITIAL',
          action: `Bắt đầu xử lý giao dịch [${type}] cho sản phẩm ${product.name} (SKU: ${product.sku})`,
          status: 'SUCCESS' as const,
          timestamp: nowStr,
        },
      ];

      // 2. Cập nhật tồn kho theo từng loại giao dịch
      let targetLocationForAlert: string | null = null;
      let newStockForAlert: number = 0;

      switch (type) {
        case TransactionType.INBOUND: {
          const locCode = locationTo || DEFAULT_WAREHOUSE;
          targetLocationForAlert = locCode;
          const locEntity = await manager.findOne(Location, { where: { code: locCode } });

          let inv = await manager.findOne(Inventory, { where: { productId, location: locCode } });
          if (!inv) {
            inv = manager.create(Inventory, {
              productId,
              location: locCode,
              locationId: locEntity?.id,
              currentQuantity: quantity,
              reservedQuantity: 0,
              createdBy: createdBy || 'system',
            });
          } else {
            inv.currentQuantity += quantity;
          }
          await manager.save(Inventory, inv);
          newStockForAlert = inv.currentQuantity;

          stepLogs.push({
            step: 'STOCK_INCREMENT_ACID',
            action: `Nhập +${quantity} vào Kệ [${locCode}]. Tồn kho mới: ${inv.currentQuantity}`,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case TransactionType.OUTBOUND: {
          const locCode = locationFrom || DEFAULT_WAREHOUSE;
          targetLocationForAlert = locCode;

          const inv = await manager.findOne(Inventory, { where: { productId, location: locCode } });
          if (!inv || inv.currentQuantity < quantity) {
            const available = inv ? inv.currentQuantity : 0;
            throw new RpcException(
              `Tồn kho không đủ để xuất! Kệ [${locCode}] hiện có ${available} sản phẩm, yêu cầu xuất: ${quantity}.`
            );
          }

          inv.currentQuantity -= quantity;
          await manager.save(Inventory, inv);
          newStockForAlert = inv.currentQuantity;

          stepLogs.push({
            step: 'STOCK_DECREMENT_ACID',
            action: `Xuất -${quantity} từ Kệ [${locCode}]. Tồn kho còn lại: ${inv.currentQuantity}`,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case TransactionType.TRANSFER: {
          const fromLoc = locationFrom!;
          const toLoc = locationTo!;

          // Trừ kệ nguồn
          const invFrom = await manager.findOne(Inventory, { where: { productId, location: fromLoc } });
          if (!invFrom || invFrom.currentQuantity < quantity) {
            const available = invFrom ? invFrom.currentQuantity : 0;
            throw new RpcException(
              `Kệ nguồn [${fromLoc}] không đủ hàng để chuyển! Hiện có: ${available}, yêu cầu: ${quantity}.`
            );
          }
          invFrom.currentQuantity -= quantity;
          await manager.save(Inventory, invFrom);

          // Cộng kệ đích
          const toLocEntity = await manager.findOne(Location, { where: { code: toLoc } });
          let invTo = await manager.findOne(Inventory, { where: { productId, location: toLoc } });
          if (!invTo) {
            invTo = manager.create(Inventory, {
              productId,
              location: toLoc,
              locationId: toLocEntity?.id,
              currentQuantity: quantity,
              reservedQuantity: 0,
              createdBy: createdBy || 'system',
            });
          } else {
            invTo.currentQuantity += quantity;
          }
          await manager.save(Inventory, invTo);
          newStockForAlert = invFrom.currentQuantity;

          stepLogs.push({
            step: 'STOCK_RELOCATION_ACID',
            action: `Điều chuyển ${quantity} từ [${fromLoc}] sang [${toLoc}] thành công.`,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          });
          break;
        }

        case TransactionType.ADJUSTMENT: {
          const locCode = locationTo || locationFrom || DEFAULT_WAREHOUSE;
          targetLocationForAlert = locCode;
          const locEntity = await manager.findOne(Location, { where: { code: locCode } });

          let inv = await manager.findOne(Inventory, { where: { productId, location: locCode } });
          if (!inv) {
            if (quantity < 0) {
              throw new RpcException(`Không thể kiểm kê giảm âm cho vị trí chưa có hàng tồn [${locCode}].`);
            }
            inv = manager.create(Inventory, {
              productId,
              location: locCode,
              locationId: locEntity?.id,
              currentQuantity: quantity,
              reservedQuantity: 0,
              createdBy: createdBy || 'system',
            });
          } else {
            if (inv.currentQuantity + quantity < 0) {
              throw new RpcException(`Tồn kho sau kiểm kê không thể âm (Hiện tại: ${inv.currentQuantity}, điều chỉnh: ${quantity}).`);
            }
            inv.currentQuantity += quantity;
          }
          await manager.save(Inventory, inv);
          newStockForAlert = inv.currentQuantity;

          stepLogs.push({
            step: 'STOCK_ADJUSTMENT_ACID',
            action: `Kiểm kê điều chỉnh ${quantity > 0 ? '+' + quantity : quantity} tại Kệ [${locCode}]. Tồn kho mới: ${inv.currentQuantity}`,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          });
          break;
        }

        default:
          throw new RpcException(`Loại giao dịch không hỗ trợ: ${type}`);
      }

      // 3. Tạo bản ghi Saga Instance để lưu vết tiến trình cho giao diện
      stepLogs.push({
        step: 'COMPLETED',
        action: `Giao dịch hoàn tất thành công nguyên khối (ACID Transaction Committed).`,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });

      const saga = manager.create(SagaInstance, {
        transactionId: 'pending',
        sagaType: type as unknown as SagaType,
        status: SagaStatus.COMPLETED,
        currentStep: 'COMPLETED',
        payload: createTransactionDto,
        stepLogs,
      });
      const savedSaga = await manager.save(SagaInstance, saga);

      // 4. Ghi nhận Transaction
      const tx = manager.create(Transaction, {
        ...createTransactionDto,
        status: TransactionStatus.COMPLETED,
        sagaId: savedSaga.id,
      });
      const savedTx = await manager.save(Transaction, tx);

      // Cập nhật lại transactionId trong saga_instance
      savedSaga.transactionId = savedTx.id;
      await manager.save(SagaInstance, savedSaga);

      this.logger.log(`[ACID Transaction] ${type} for Product ${product.name} (Qty: ${quantity}) committed successfully. Tx ID: ${savedTx.id}`);

      // 5. Kiểm tra và kích hoạt cảnh báo tồn kho bất đồng bộ (ngoài transaction DB)
      this.checkAndEmitAlert(product, newStockForAlert);

      return savedTx;
    });
  }

  private async checkAndEmitAlert(product: Product, currentStock: number) {
    try {
      const minStock = product.minStockLevel ?? 20;
      if (currentStock < minStock) {
        firstValueFrom(
          this.notificationClient.emit('stock.changed', {
            productId: product.id,
            productName: product.name,
            newStock: currentStock,
            threshold: minStock,
            alertType: 'LOW_STOCK',
          })
        ).catch(() => {});
      }
    } catch (e: any) {
      this.logger.warn(`Failed to emit notification alert: ${e.message}`);
    }
  }

  private validateBusinessRules(dto: CreateTransactionDto) {
    const { type, quantity, locationFrom, locationTo } = dto;

    if (type === TransactionType.ADJUSTMENT) {
      if (!quantity) {
        throw new RpcException('ADJUSTMENT yêu cầu quantity khác 0 (dương: tăng, âm: giảm tồn kho)');
      }
      if (!locationFrom && !locationTo) {
        throw new RpcException('ADJUSTMENT yêu cầu locationFrom hoặc locationTo');
      }
      return;
    }

    if (!quantity || quantity <= 0) {
      throw new RpcException('quantity phải là số dương với INBOUND/OUTBOUND/TRANSFER');
    }
    if (type === TransactionType.INBOUND && !dto.locationTo) {
      dto.locationTo = DEFAULT_WAREHOUSE;
    }
    if (type === TransactionType.OUTBOUND && !locationFrom) {
      throw new RpcException('OUTBOUND yêu cầu Từ Kệ Kho (locationFrom)');
    }
    if (type === TransactionType.TRANSFER && (!locationFrom || !locationTo)) {
      throw new RpcException('TRANSFER yêu cầu cả locationFrom và locationTo');
    }
  }

  async findAll(
    payloadOrPage: any = {},
    limitParam?: number,
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const isNumberCall = typeof payloadOrPage === 'number';
    const page = isNumberCall ? payloadOrPage : (payloadOrPage?.page || 1);
    const limit = isNumberCall ? (limitParam || 20) : (payloadOrPage?.limit || 20);

    const payload = isNumberCall ? {} : (payloadOrPage || {});
    const sortBy = payload.sortBy || 'createdAt';
    const sortOrder = payload.sortOrder || 'DESC';

    const queryBuilder = this.transactionRepository.createQueryBuilder('tx');

    if (payload.type) {
      queryBuilder.andWhere('tx.type = :type', { type: payload.type });
    }

    if (payload.status) {
      queryBuilder.andWhere('tx.status = :status', { status: payload.status });
    }

    if ((payload as any).startDate) {
      queryBuilder.andWhere('tx.createdAt >= :startDate', { startDate: new Date((payload as any).startDate) });
    }

    if ((payload as any).endDate) {
      const end = new Date((payload as any).endDate);
      end.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('tx.createdAt <= :endDate', { endDate: end });
    }

    if (payload.search) {
      const s = `%${payload.search.trim()}%`;
      const searchProductIds = (payload as any).productIds || [];
      if (Array.isArray(searchProductIds) && searchProductIds.length > 0) {
        queryBuilder.andWhere(
          '(tx.note ILIKE :s OR CAST(tx.type AS text) ILIKE :s OR CAST(tx.status AS text) ILIKE :s OR tx.productId IN (:...searchProductIds))',
          { s, searchProductIds }
        );
      } else {
        queryBuilder.andWhere(
          '(tx.note ILIKE :s OR CAST(tx.type AS text) ILIKE :s OR CAST(tx.status AS text) ILIKE :s OR tx.productId ILIKE :s)',
          { s }
        );
      }
    }

    const allowedSortFields = ['createdAt', 'quantity', 'type', 'status', 'updatedAt'];
    const sortField = allowedSortFields.includes(sortBy) ? `tx.${sortBy}` : 'tx.createdAt';

    queryBuilder
      .orderBy(sortField, sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByProduct(
    productId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Transaction[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.transactionRepository.findAndCount({
      where: { productId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Transaction | null> {
    return this.transactionRepository.findOne({ where: { id } });
  }

  async update(id: string, dto: { quantity?: number; note?: string }): Promise<Transaction> {
    const tx = await this.transactionRepository.findOne({ where: { id } });
    if (!tx) throw new RpcException('Không tìm thấy giao dịch.');

    if (dto.note !== undefined) {
      tx.note = dto.note;
    }
    return this.transactionRepository.save(tx);
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const tx = await this.transactionRepository.findOne({ where: { id } });
    if (!tx) throw new RpcException('Không tìm thấy giao dịch.');

    await this.transactionRepository.remove(tx);
    return { success: true, message: 'Đã xóa giao dịch thành công.' };
  }

  // --- Hỗ trợ tương thích ngược cho giao diện Modal Saga ---
  async getSagaByTransactionId(transactionId: string) {
    const saga = await this.sagaRepository.findOne({ where: { transactionId } });
    if (!saga) {
      // Nếu là giao dịch cũ chưa có bản ghi saga, dựng bản ghi biểu diễn ACID thành công
      const tx = await this.transactionRepository.findOne({ where: { id: transactionId } });
      if (!tx) return null;
      return {
        id: `acid-${tx.id.slice(0, 8)}`,
        transactionId: tx.id,
        sagaType: tx.type,
        status: 'COMPLETED',
        currentStep: 'COMPLETED (ACID)',
        payload: { productId: tx.productId, type: tx.type, quantity: tx.quantity },
        stepLogs: [
          { step: 'INITIAL', action: `Bắt đầu xử lý giao dịch [${tx.type}]`, status: 'SUCCESS', timestamp: tx.createdAt.toISOString() },
          { step: 'ACID_EXECUTION', action: `Thực thi cập nhật kho & lưu vết trong 1 Database Transaction nguyên khối`, status: 'SUCCESS', timestamp: tx.createdAt.toISOString() },
          { step: 'COMPLETED', action: `Giao dịch hoàn tất thành công (100% nhất quán dữ liệu)`, status: 'SUCCESS', timestamp: tx.updatedAt.toISOString() },
        ],
        createdAt: tx.createdAt,
      };
    }
    return saga;
  }

  async getSagaById(id: string) {
    return this.sagaRepository.findOne({ where: { id } });
  }

  async getAllSagas(page = 1, limit = 20, status?: string) {
    const where: any = {};
    if (status) where.status = status;
    const [data, total] = await this.sagaRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
