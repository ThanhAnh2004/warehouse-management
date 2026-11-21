import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Supplier } from './entities/supplier.entity';
import { SupplierProduct } from './entities/supplier-product.entity';
import { PurchaseOrder, POStatus } from './entities/purchase-order.entity';
import { PurchaseOrderItem } from './entities/purchase-order-item.entity';
import { CreatePODto, CreateSupplierDto } from './dto/create-po.dto';

@Injectable()
export class ProcurementService implements OnModuleInit {
  private readonly logger = new Logger(ProcurementService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(SupplierProduct)
    private readonly supplierProductRepository: Repository<SupplierProduct>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly poItemRepository: Repository<PurchaseOrderItem>,
    @Inject('INVENTORY_SERVICE')
    private readonly inventoryClient: ClientProxy,
  ) {}

  async onModuleInit() {
    await this.seedInitialSuppliers();
  }

  private async seedInitialSuppliers() {
    try {
      const initialSuppliers = [
        {
          code: 'SUP-APPLE',
          name: 'Công ty TNHH Apple Việt Nam',
          contactPerson: 'Nguyễn Văn Hùng',
          phone: '0901234567',
          email: 'b2b-vietnam@apple.com',
          address: 'Tầng 18, Tòa nhà Deutsches Haus, Q.1, TP. HCM',
          rating: 4.9,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-SAMSUNG',
          name: 'Công ty Điện tử Samsung Vina',
          contactPerson: 'Trần Thị Mai',
          phone: '0902345678',
          email: 'sales.b2b@samsung.com',
          address: 'Tòa nhà Bitexco Financial Tower, Q.1, TP. HCM',
          rating: 4.8,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-SONY',
          name: 'Sony Electronics Việt Nam',
          contactPerson: 'Lê Minh Tuấn',
          phone: '0903456789',
          email: 'enterprise@sony.com.vn',
          address: 'Tòa nhà Landmark 81, Q. Bình Thạnh, TP. HCM',
          rating: 4.7,
          paymentTerms: 'Net 45',
        },
        {
          code: 'SUP-LG',
          name: 'LG Electronics Việt Nam Hải Phòng',
          contactPerson: 'Phạm Hải Đăng',
          phone: '0904567890',
          email: 'procurement@lge.vn',
          address: 'KCN Tràng Duệ, Huyện An Dương, Hải Phòng',
          rating: 4.6,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-XIAOMI',
          name: 'Xiaomi Technology Việt Nam',
          contactPerson: 'Vũ Hoàng Nam',
          phone: '0905678901',
          email: 'distributor@xiaomi.com',
          address: 'Tòa nhà Vincom Center, Q.1, TP. HCM',
          rating: 4.8,
          paymentTerms: 'Net 15',
        },
        {
          code: 'SUP-ASUS',
          name: 'ASUS Computer Việt Nam',
          contactPerson: 'Đoàn Quốc Bảo',
          phone: '0906789012',
          email: 'sales.b2b@asus.com.vn',
          address: 'Tòa nhà Viettel Complex, Q.10, TP. HCM',
          rating: 4.8,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-DELL',
          name: 'Dell Technologies Việt Nam',
          contactPerson: 'Hoàng Minh Trí',
          phone: '0907890123',
          email: 'enterprise@dell.com.vn',
          address: 'Tòa nhà Saigon Tower, Q.1, TP. HCM',
          rating: 4.9,
          paymentTerms: 'Net 45',
        },
        {
          code: 'SUP-HP',
          name: 'HP Inc. Việt Nam',
          contactPerson: 'Lê Thanh Thảo',
          phone: '0908901234',
          email: 'commercial@hp.com.vn',
          address: 'Tòa nhà E-Town Central, Q.4, TP. HCM',
          rating: 4.7,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-LENOVO',
          name: 'Lenovo PC HK Limited Việt Nam',
          contactPerson: 'Trương Vĩnh Kỳ',
          phone: '0909012345',
          email: 'vn_commercial@lenovo.com',
          address: 'Tòa nhà Keangnam Landmark 72, Nam Từ Liêm, Hà Nội',
          rating: 4.8,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-LOGITECH',
          name: 'Logitech International S.A Việt Nam',
          contactPerson: 'Võ Thành Đạt',
          phone: '0910123456',
          email: 'channel@logitech.com.vn',
          address: 'Tầng 12, Tòa nhà mPlaza Saigon, Q.1, TP. HCM',
          rating: 4.9,
          paymentTerms: 'Net 15',
        },
        {
          code: 'SUP-PANASONIC',
          name: 'Panasonic Appliances Việt Nam',
          contactPerson: 'Ngô Quang Khải',
          phone: '0911234567',
          email: 'b2b@panasonic.com.vn',
          address: 'KCN Thăng Long, Đông Anh, Hà Nội',
          rating: 4.7,
          paymentTerms: 'Net 45',
        },
        {
          code: 'SUP-CANON',
          name: 'Canon Marketing Việt Nam',
          contactPerson: 'Bùi Phương Nam',
          phone: '0912345678',
          email: 'pro_solutions@canon.com.vn',
          address: 'Tòa nhà President Place, Q.1, TP. HCM',
          rating: 4.8,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-ANKER',
          name: 'Anker Innovations Việt Nam',
          contactPerson: 'Dương Gia Huy',
          phone: '0913456789',
          email: 'distributor@anker.com.vn',
          address: 'Tòa nhà CentrePoint, Q. Phú Nhuận, TP. HCM',
          rating: 4.9,
          paymentTerms: 'Net 15',
        },
        {
          code: 'SUP-ACER',
          name: 'Acer Vietnam Co., Ltd',
          contactPerson: 'Đặng Quốc Huy',
          phone: '0914567890',
          email: 'partner@acer.com.vn',
          address: 'Tòa nhà Vincom Đồng Khởi, Q.1, TP. HCM',
          rating: 4.6,
          paymentTerms: 'Net 30',
        },
      ];

      let addedCount = 0;
      for (const sup of initialSuppliers) {
        const existing = await this.supplierRepository.findOne({ where: { code: sup.code } });
        if (!existing) {
          const entity = this.supplierRepository.create(sup);
          await this.supplierRepository.save(entity);
          addedCount++;
        }
      }
      if (addedCount > 0) {
        this.logger.log(`Đã khởi tạo bổ sung thành công ${addedCount} Nhà cung cấp chính ngạch.`);
      }
    } catch (e: any) {
      this.logger.warn(`Không thể seed NCC: ${e.message}`);
    }
  }

  // --- Suppliers Management ---
  async findAllSuppliers(): Promise<Supplier[]> {
    return this.supplierRepository.find({
      order: { rating: 'DESC', name: 'ASC' },
      relations: { products: true },
    });
  }

  async findOneSupplier(id: string): Promise<Supplier | null> {
    return this.supplierRepository.findOne({
      where: { id },
      relations: { products: true },
    });
  }

  async createSupplier(dto: CreateSupplierDto): Promise<Supplier> {
    const entity = this.supplierRepository.create(dto);
    return this.supplierRepository.save(entity);
  }

  // --- Purchase Orders Management ---
  async findAllPOs(query: { status?: string; search?: string } = {}): Promise<PurchaseOrder[]> {
    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.items', 'item')
      .orderBy('po.createdAt', 'DESC');

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(po.poNumber ILIKE :s OR po.supplierName ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findOnePO(id: string): Promise<PurchaseOrder | null> {
    return this.poRepository.findOne({
      where: { id },
      relations: { items: true },
    });
  }

  async createPO(dto: CreatePODto): Promise<PurchaseOrder | null> {
    const supplier = await this.supplierRepository.findOne({
      where: { id: dto.supplierId },
    });

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.poRepository.count();
    const poNumber = `PO-${today}-${String(count + 1).padStart(3, '0')}`;

    const totalAmount = (dto.items || []).reduce(
      (sum, it) => sum + it.requestedQuantity * (it.unitPrice || 0),
      0,
    );

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (dto.expectedDeliveryDays || 3));

    const po = new PurchaseOrder();
    po.poNumber = poNumber;
    po.supplierId = dto.supplierId;
    po.supplierName = supplier?.name || dto.supplierName || 'Nhà Cung Cấp';
    po.status = POStatus.DRAFT;
    po.totalAmount = totalAmount;
    po.expectedDeliveryDate = deliveryDate;
    po.receivingDock = 'CỬA 01 - IN (CẢNG A)';
    po.notes = dto.notes || '';
    po.triggerSource = dto.triggerSource || 'MANUAL';

    const savedPO = await this.poRepository.save(po);

    const poItems: PurchaseOrderItem[] = [];
    for (const it of dto.items || []) {
      const item = new PurchaseOrderItem();
      item.purchaseOrderId = savedPO.id;
      item.productId = it.productId;
      item.sku = it.sku;
      item.productName = it.productName;
      item.requestedQuantity = it.requestedQuantity;
      item.receivedQuantity = 0;
      item.unitPrice = it.unitPrice;
      item.subtotal = it.requestedQuantity * (it.unitPrice || 0);
      poItems.push(await this.poItemRepository.save(item));
    }
    savedPO.items = poItems;

    return this.findOnePO(savedPO.id);
  }

  async approvePO(id: string): Promise<PurchaseOrder | null> {
    const po = await this.findOnePO(id);
    if (!po) return null;

    po.status = POStatus.APPROVED;
    return this.poRepository.save(po);
  }

  async receivePO(id: string): Promise<PurchaseOrder | null> {
    const po = await this.findOnePO(id);
    if (!po) return null;

    if (po.status === POStatus.RECEIVED) {
      return po;
    }

    // Tiến hành nhập kho tại Cửa 01 - IN cho từng sản phẩm
    for (const item of po.items || []) {
      try {
        await firstValueFrom(
          this.inventoryClient.send('stock.receive_procurement', {
            productId: item.productId,
            quantity: item.requestedQuantity,
            poNumber: po.poNumber,
            supplierName: po.supplierName,
          }),
        );
        item.receivedQuantity = item.requestedQuantity;
        await this.poItemRepository.save(item);
      } catch (err: any) {
        this.logger.error(`Lỗi nhập kho PO ${po.poNumber}: ${err.message}`);
      }
    }

    po.status = POStatus.RECEIVED;
    po.actualReceivedDate = new Date();
    return this.poRepository.save(po);
  }

  // --- AI-DRIVEN AUTO-PO GENERATION (ROP & EOQ) ---
  async triggerAutoPO(): Promise<{ success: boolean; message: string; generatedCount: number; purchaseOrders: PurchaseOrder[] }> {
    try {
      const lowStockProducts: any[] = await firstValueFrom(
        this.inventoryClient.send('stock.get_low_stock', {}),
      );

      if (!lowStockProducts || lowStockProducts.length === 0) {
        return {
          success: true,
          message: 'Tất cả các sản phẩm trong kho đang ở mức tồn an toàn. Chưa cần bổ sung hàng.',
          generatedCount: 0,
          purchaseOrders: [],
        };
      }

      const suppliers = await this.supplierRepository.find();
      if (suppliers.length === 0) {
        return {
          success: false,
          message: 'Chưa có Nhà cung cấp nào được cấu hình trong hệ thống.',
          generatedCount: 0,
          purchaseOrders: [],
        };
      }

      // Nhóm sản phẩm theo Nhà cung cấp phù hợp (Brand Matching)
      const supplierMap = new Map<string, { supplier: Supplier; items: any[] }>();

      for (const prod of lowStockProducts) {
        const nameLower = (prod.name || '').toLowerCase();
        let matchedSupplier = suppliers[0];

        if (nameLower.includes('apple') || nameLower.includes('iphone') || nameLower.includes('ipad') || nameLower.includes('macbook')) {
          matchedSupplier = suppliers.find((s) => s.code === 'SUP-APPLE') || suppliers[0];
        } else if (nameLower.includes('samsung') || nameLower.includes('galaxy')) {
          matchedSupplier = suppliers.find((s) => s.code === 'SUP-SAMSUNG') || suppliers[0];
        } else if (nameLower.includes('sony') || nameLower.includes('bravia')) {
          matchedSupplier = suppliers.find((s) => s.code === 'SUP-SONY') || suppliers[0];
        } else if (nameLower.includes('lg')) {
          matchedSupplier = suppliers.find((s) => s.code === 'SUP-LG') || suppliers[0];
        } else if (nameLower.includes('xiaomi') || nameLower.includes('redmi')) {
          matchedSupplier = suppliers.find((s) => s.code === 'SUP-XIAOMI') || suppliers[0];
        }

        // Tính lượng đặt hàng tối ưu (EOQ): Bổ sung đủ để gấp 2 lần mức tồn tối thiểu an toàn
        const currentQty = Number(prod.currentQuantity) || 0;
        const minLevel = Number(prod.minStockLevel) || 10;
        const suggestedQty = Math.max(10, minLevel * 2 - currentQty);

        // Giá nhập sỉ ước tính ~ 75% giá bán lẻ
        const unitPrice = prod.price > 0 ? Math.round(prod.price * 0.75) : 10000000;

        if (!supplierMap.has(matchedSupplier.id)) {
          supplierMap.set(matchedSupplier.id, {
            supplier: matchedSupplier,
            items: [],
          });
        }

        supplierMap.get(matchedSupplier.id)!.items.push({
          productId: prod.productId,
          sku: prod.sku,
          productName: prod.name,
          requestedQuantity: suggestedQty,
          unitPrice,
        });
      }

      // Tạo các Purchase Orders tự động
      const createdPOs: PurchaseOrder[] = [];
      for (const group of supplierMap.values()) {
        const po = await this.createPO({
          supplierId: group.supplier.id,
          supplierName: group.supplier.name,
          expectedDeliveryDays: 3,
          triggerSource: 'AI_AUTO_SUGGESTION',
          notes: 'Đơn mua hàng tự động tạo bởi thuật toán AI ROP/EOQ do cảnh báo chạm ngưỡng an toàn.',
          items: group.items,
        });
        if (po) createdPOs.push(po);
      }

      return {
        success: true,
        message: `Hệ thống AI đã tự động phân tích và tạo ${createdPOs.length} đơn mua hàng (PO) tối ưu chi phí lưu kho.`,
        generatedCount: createdPOs.length,
        purchaseOrders: createdPOs,
      };
    } catch (err: any) {
      this.logger.error(`Lỗi sinh Auto-PO: ${err.message}`);
      return {
        success: false,
        message: `Lỗi khi chạy thuật toán tự động sinh PO: ${err.message}`,
        generatedCount: 0,
        purchaseOrders: [],
      };
    }
  }
}
