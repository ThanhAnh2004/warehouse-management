import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Order, OrderStatus, OrderType } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { PickList, PickListStatus } from './entities/pick-list.entity';
import { PickListItem } from './entities/pick-list-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(PickList)
    private readonly pickListRepository: Repository<PickList>,
    @InjectRepository(PickListItem)
    private readonly pickListItemRepository: Repository<PickListItem>,
    @Inject('INVENTORY_SERVICE')
    private readonly inventoryClient: ClientProxy,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order | null> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.orderRepository.count();
    const orderNumber = `ORD-${today}-${String(count + 1).padStart(3, '0')}`;

    const totalAmount = (dto.items || []).reduce(
      (sum, item) => sum + item.quantity * (item.unitPrice || 0),
      0,
    );

    const sagaTrace = [
      {
        step: 'ORDER_CREATED',
        action: `Khởi tạo đơn hàng ${orderNumber}`,
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      },
    ];

    const orderEntity = new Order();
    orderEntity.orderNumber = orderNumber;
    orderEntity.customerName = dto.customerName;
    orderEntity.customerPhone = dto.customerPhone || '';
    orderEntity.shippingAddress = dto.shippingAddress || 'Nhận tại siêu thị';
    orderEntity.orderType = dto.orderType || OrderType.RETAIL_ONLINE;
    orderEntity.priority = dto.priority || 'NORMAL';
    orderEntity.status = OrderStatus.PENDING;
    orderEntity.totalAmount = totalAmount;
    orderEntity.notes = dto.notes || '';
    orderEntity.sagaTrace = sagaTrace;

    const savedOrder = await this.orderRepository.save(orderEntity);

    const orderItems: OrderItem[] = [];
    for (const it of dto.items || []) {
      const item = new OrderItem();
      item.orderId = savedOrder.id;
      item.productId = it.productId;
      item.productName = it.productName;
      item.sku = it.sku;
      item.quantity = it.quantity;
      item.allocatedQuantity = 0;
      item.unitPrice = it.unitPrice || 0;
      item.subtotal = it.quantity * (it.unitPrice || 0);
      orderItems.push(await this.orderItemRepository.save(item));
    }
    savedOrder.items = orderItems;

    // --- SAGA STEP 2: RESERVE STOCK IN INVENTORY SERVICE ---
    const reservedItems: { productId: string; quantity: number }[] = [];
    let isSagaSuccess = true;
    let failureReason = '';

    for (const item of orderItems) {
      try {
        const res: any = await firstValueFrom(
          this.inventoryClient.send('stock.reserve', {
            productId: item.productId,
            quantity: item.quantity,
          }),
        );

        if (res && res.success) {
          item.allocatedQuantity = item.quantity;
          item.locationCode = res.locationCode || 'A01';
          item.zone = res.zone || 'Khu Nhặt Hàng Nhanh';
          await this.orderItemRepository.save(item);
          reservedItems.push({
            productId: item.productId,
            quantity: item.quantity,
          });

          sagaTrace.push({
            step: 'STOCK_RESERVED',
            action: `Khóa thành công ${item.quantity} chiếc [${item.sku}] tại vị trí ${item.locationCode}`,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
          });
        } else {
          isSagaSuccess = false;
          failureReason = res?.message || `Hết hàng tồn khả dụng cho ${item.sku}`;
          break;
        }
      } catch (err: any) {
        isSagaSuccess = false;
        failureReason = `Lỗi kết nối Inventory: ${err.message}`;
        break;
      }
    }

    if (isSagaSuccess) {
      savedOrder.status = OrderStatus.ALLOCATED;
      sagaTrace.push({
        step: 'SAGA_ALLOCATED',
        action: 'Tất cả sản phẩm đã được khóa tồn kho an toàn (100% Allocated). Sinh phiếu soạn hàng.',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });
      savedOrder.sagaTrace = sagaTrace;
      await this.orderRepository.save(savedOrder);

      // Tự động tạo PickList phân theo vị trí kệ
      await this.generatePickList(savedOrder);
    } else {
      // --- SAGA COMPENSATION (BÙ TRỪ): MỞ KHÓA TỒN KHO ĐÃ GIỮ ---
      for (const rev of reservedItems) {
        try {
          await firstValueFrom(
            this.inventoryClient.send('stock.release_reserve', rev),
          );
        } catch (e) {}
      }

      savedOrder.status = OrderStatus.OUT_OF_STOCK;
      sagaTrace.push({
        step: 'SAGA_COMPENSATED',
        action: `Giao dịch bù trừ kích hoạt: Mở khóa hàng trả lại kho. Lý do: ${failureReason}`,
        status: 'FAILED',
        timestamp: new Date().toISOString(),
      });
      savedOrder.sagaTrace = sagaTrace;
      await this.orderRepository.save(savedOrder);
    }

    return this.findOneOrder(savedOrder.id);
  }

  async generatePickList(order: Order): Promise<PickList | null> {
    const existing = await this.pickListRepository.findOne({
      where: { orderId: order.id },
    });
    if (existing) return existing;

    const pickList = new PickList();
    pickList.orderId = order.id;
    pickList.orderNumber = order.orderNumber;
    pickList.pickerName = 'Đội Soạn Hàng ' + (order.priority === 'HIGH' ? 'Hỏa Tốc' : 'Tiêu Chuẩn');
    pickList.status = PickListStatus.PENDING;

    const savedPL = await this.pickListRepository.save(pickList);

    // Sắp xếp sản phẩm theo mã vị trí kệ để tối ưu lộ trình nhặt hàng
    const sortedItems = [...(order.items || [])].sort((a, b) =>
      (a.locationCode || 'A01').localeCompare(b.locationCode || 'A01'),
    );

    for (const item of sortedItems) {
      const plItem = new PickListItem();
      plItem.pickListId = savedPL.id;
      plItem.productId = item.productId;
      plItem.productName = item.productName;
      plItem.sku = item.sku;
      plItem.locationCode = item.locationCode || 'A01';
      plItem.zone = item.zone || 'Khu Nhặt Hàng Nhanh';
      plItem.quantityToPick = item.quantity;
      plItem.pickedQuantity = 0;
      plItem.isPicked = false;
      await this.pickListItemRepository.save(plItem);
    }

    return this.findPickListByOrderId(order.id);
  }

  async findAllOrders(query: { status?: string; search?: string } = {}) {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .orderBy('order.createdAt', 'DESC');

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(order.orderNumber ILIKE :s OR order.customerName ILIKE :s OR order.customerPhone ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findOneOrder(id: string): Promise<Order | null> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: { items: true },
    });
    return order || null;
  }

  async findPickListByOrderId(orderId: string): Promise<PickList | null> {
    const pl = await this.pickListRepository.findOne({
      where: { orderId },
      relations: { items: true },
    });
    return pl || null;
  }

  async confirmPickItem(
    itemId: string,
    pickedQuantity: number,
    serialNumbers?: string,
  ): Promise<PickListItem | null> {
    const item = await this.pickListItemRepository.findOne({
      where: { id: itemId },
    });
    if (!item) return null;

    item.pickedQuantity = pickedQuantity;
    item.serialNumbers = serialNumbers || item.serialNumbers || '';
    item.isPicked = item.pickedQuantity >= item.quantityToPick;
    await this.pickListItemRepository.save(item);

    // Kiểm tra xem tất cả các item trong pick list đã hoàn thành chưa
    const allItems = await this.pickListItemRepository.find({
      where: { pickListId: item.pickListId },
    });
    const allDone = allItems.every((it) => it.isPicked);

    if (allDone) {
      const pl = await this.pickListRepository.findOne({
        where: { id: item.pickListId },
      });
      if (pl) {
        pl.status = PickListStatus.COMPLETED;
        pl.completedAt = new Date();
        await this.pickListRepository.save(pl);

        // Chuyển trạng thái Order sang PACKED
        const order = await this.orderRepository.findOne({
          where: { id: pl.orderId },
        });
        if (order) {
          order.status = OrderStatus.PACKED;
          if (Array.isArray(order.sagaTrace)) {
            order.sagaTrace.push({
              step: 'ORDER_PACKED',
              action:
                'Đã hoàn tất nhặt hàng tại kệ & đóng gói kèm mã Serial/IMEI. Sẵn sàng xuất xưởng.',
              status: 'SUCCESS',
              timestamp: new Date().toISOString(),
            });
          }
          await this.orderRepository.save(order);
        }
      }
    } else {
      const pl = await this.pickListRepository.findOne({
        where: { id: item.pickListId },
      });
      if (pl && pl.status === PickListStatus.PENDING) {
        pl.status = PickListStatus.IN_PROGRESS;
        pl.startedAt = new Date();
        await this.pickListRepository.save(pl);
      }
    }

    return item;
  }

  async dispatchOrder(orderId: string): Promise<Order | null> {
    const order = await this.findOneOrder(orderId);
    if (!order) return null;

    // Trừ kho thực tế trong inventory service
    for (const item of order.items || []) {
      try {
        await firstValueFrom(
          this.inventoryClient.send('stock.deduct_reserved', {
            productId: item.productId,
            quantity: item.quantity,
            orderNumber: order.orderNumber,
          }),
        );
      } catch (err: any) {
        this.logger.error(`Lỗi trừ kho khi xuất xưởng đơn: ${err.message}`);
      }
    }

    order.status = OrderStatus.DISPATCHED;
    if (Array.isArray(order.sagaTrace)) {
      order.sagaTrace.push({
        step: 'ORDER_DISPATCHED',
        action:
          'Đã xuất kho thực tế qua [CẢNG A] CỬA XUẤT HÀNG (CỬA 02 - OUT). Hoàn tất toàn bộ chu trình Saga.',
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
      });
    }
    return this.orderRepository.save(order);
  }
}
