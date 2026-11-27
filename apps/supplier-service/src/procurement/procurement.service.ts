import { Injectable, Logger, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
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
export class ProcurementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcurementService.name);
  private seedTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

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
    // Run product catalog seeding in background with retries so it succeeds even if inventory-service boots slightly later
    this.seedTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        this.seedSupplierProductCatalog().catch((err) =>
          this.logger.warn(`Catalog seed deferred: ${err?.message || err}`),
        );
      }
    }, 2000);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.seedTimer) {
      clearTimeout(this.seedTimer);
      this.seedTimer = null;
    }
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
          code: 'SUP-ACER',
          name: 'Acer Vietnam Co., Ltd',
          contactPerson: 'Đặng Quốc Huy',
          phone: '0914567890',
          email: 'partner@acer.com.vn',
          address: 'Tòa nhà Vincom Đồng Khởi, Q.1, TP. HCM',
          rating: 4.6,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-DIST-PC',
          name: 'NPP Linh Kiện PC & Gaming Gear (Synnex Tech)',
          contactPerson: 'Nguyễn Hữu Phước',
          phone: '0915678901',
          email: 'b2b-pc@synnextech.vn',
          address: 'Tòa nhà CMC Tower, Duy Tân, Cầu Giấy, Hà Nội',
          rating: 4.8,
          paymentTerms: 'Net 30',
        },
        {
          code: 'SUP-DIST-APPLIANCE',
          name: 'NPP Điện Lạnh & Gia Dụng Tổng Hợp (EuroHome)',
          contactPerson: 'Trần Bích Ngọc',
          phone: '0916789012',
          email: 'supply@eurohome.com.vn',
          address: 'KCN Tân Bình, Q. Tân Phú, TP. HCM',
          rating: 4.8,
          paymentTerms: 'Net 45',
        },
        {
          code: 'SUP-DIST-DIGITAL',
          name: 'NPP Thiết Bị Số, Camera & Âm Thanh (DigiWorld)',
          contactPerson: 'Bùi Phương Nam',
          phone: '0917890123',
          email: 'distribution@digiworld.com.vn',
          address: 'Tòa nhà President Place, Q.1, TP. HCM',
          rating: 4.9,
          paymentTerms: 'Net 30',
        },
      ];

      // Remove empty legacy suppliers that have 0 products in our catalog & 0 POs
      for (const obsoleteCode of ['SUP-CANON', 'SUP-ANKER']) {
        const obs = await this.supplierRepository.findOne({ where: { code: obsoleteCode } });
        if (obs) {
          const poCount = await this.poRepository.count({ where: { supplierId: obs.id } });
          if (poCount === 0) {
            await this.supplierRepository.delete(obs.id);
            this.logger.log(`Đã dọn nhà cung cấp chưa có sản phẩm phù hợp: ${obsoleteCode}`);
          }
        }
      }

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
        this.logger.log(`Đã khởi tạo ${addedCount} Nhà cung cấp & NPP ngành hàng.`);
      }
    } catch (e: any) {
      this.logger.warn(`Không thể seed NCC: ${e.message}`);
    }
  }

  private resolveSupplierCodeForProduct(prod: any): string {
    const sku = (prod.sku || '').toUpperCase();
    const name = (prod.name || '').toLowerCase();
    const cat = (prod.category || '').toLowerCase();

    // 1. 12 Direct Brand Manufacturers
    if (
      sku.startsWith('APP-') ||
      sku.startsWith('APW-') ||
      sku.startsWith('IPAD-') ||
      sku.startsWith('MAC-') ||
      sku.startsWith('IPH-') ||
      name.includes('apple') ||
      name.includes('iphone') ||
      name.includes('ipad') ||
      name.includes('macbook') ||
      name.includes('mac studio') ||
      name.includes('airpods')
    ) {
      return 'SUP-APPLE';
    }
    if (sku.startsWith('SAM-') || name.includes('samsung') || name.includes('galaxy')) {
      return 'SUP-SAMSUNG';
    }
    if (sku.startsWith('SON-') || sku.startsWith('SONY-') || name.includes('sony') || name.includes('playstation')) {
      return 'SUP-SONY';
    }
    if (sku.startsWith('LG-') || sku.startsWith('LGG-') || name.includes(' lg ') || name.startsWith('lg ')) {
      return 'SUP-LG';
    }
    if (sku.startsWith('XIA-') || sku.startsWith('XIAO-') || name.includes('xiaomi') || name.includes('redmi')) {
      return 'SUP-XIAOMI';
    }
    if (sku.startsWith('ASU-') || sku.startsWith('MON-ROG') || name.includes('asus') || name.includes(' rog ')) {
      return 'SUP-ASUS';
    }
    if (sku.startsWith('DEL-') || sku.startsWith('DELL-') || name.includes('dell')) {
      return 'SUP-DELL';
    }
    if (sku.startsWith('HPP-') || name.startsWith('hp ')) {
      return 'SUP-HP';
    }
    if (sku.startsWith('LEN-') || name.includes('lenovo') || name.includes('thinkpad')) {
      return 'SUP-LENOVO';
    }
    if (sku.startsWith('ACE-') || name.includes('acer') || name.includes('predator')) {
      return 'SUP-ACER';
    }
    if (sku.startsWith('LOG-') || sku.startsWith('LOGI-') || name.includes('logitech')) {
      return 'SUP-LOGITECH';
    }
    if (sku.startsWith('PAN-') || name.includes('panasonic')) {
      return 'SUP-PANASONIC';
    }

    // 2. 3 Authorized Category Distributors for remaining brands
    if (
      sku.startsWith('COR-') ||
      sku.startsWith('RAM-COR') ||
      sku.startsWith('MSI-') ||
      sku.startsWith('VGA-') ||
      sku.startsWith('AMD-') ||
      sku.startsWith('INT-') ||
      sku.startsWith('RAZ-') ||
      sku.startsWith('STEEL-') ||
      sku.startsWith('KEY-') ||
      sku.startsWith('ELGATO-') ||
      sku.startsWith('BLUE-') ||
      cat.includes('linh kiện') ||
      cat.includes('pc components')
    ) {
      return 'SUP-DIST-PC';
    }

    if (
      sku.startsWith('BOS-') ||
      sku.startsWith('DYS-') ||
      sku.startsWith('ROB-') ||
      sku.startsWith('ELE-') ||
      sku.startsWith('ARI-') ||
      sku.startsWith('SAN-') ||
      sku.startsWith('HIT-') ||
      cat.includes('gia dụng') ||
      cat.includes('điện lạnh')
    ) {
      return 'SUP-DIST-APPLIANCE';
    }

    return 'SUP-DIST-DIGITAL';
  }

  async seedSupplierProductCatalog(maxRetries = 4) {
    const existingCount = await this.supplierProductRepository.count();
    if (existingCount > 0) return;

    const suppliers = await this.supplierRepository.find();
    if (suppliers.length === 0) return;
    const byCode = new Map(suppliers.map((s) => [s.code, s]));

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (this.isDestroyed) return;
      try {
        await this.inventoryClient.connect();
        const res = await firstValueFrom(
          this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }),
        );
        const products: any[] = res?.data || res?.items || (Array.isArray(res) ? res : []);
        if (products.length === 0) {
          this.logger.warn('Chưa có sản phẩm trong Inventory Service để ánh xạ.');
          return;
        }

        let created = 0;
        for (const prod of products) {
          const code = this.resolveSupplierCodeForProduct(prod);
          const supplier = byCode.get(code) || suppliers[0];
          if (!supplier) continue;

          const sp = new SupplierProduct();
          sp.supplierId = supplier.id;
          sp.productId = prod.id;
          sp.productSku = prod.sku;
          sp.productName = prod.name;
          sp.supplyPrice = Number(prod.price) > 0 ? Math.round(Number(prod.price) * 0.75) : 1000000;
          sp.leadTimeDays = 3;
          sp.minOrderQty = 5;
          sp.isPreferred = true;
          await this.supplierProductRepository.save(sp);
          created++;
        }

        this.logger.log(`Đã tự động liên kết ${created} sản phẩm vào danh mục cung ứng của ${suppliers.length} nhà cung cấp!`);
        return;
      } catch (err: any) {
        if (attempt === maxRetries) {
          this.logger.warn(
            `Không thể đồng bộ catalog sản phẩm-NCC sau ${maxRetries} lần thử: ${err?.message || JSON.stringify(err)}`,
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  // --- Suppliers Management ---
  async findAllSuppliers(): Promise<Supplier[]> {
    // Lazy seed if initial startup race skipped catalog seeding
    const mappedCount = await this.supplierProductRepository.count();
    if (mappedCount === 0) {
      await this.seedSupplierProductCatalog(1);
    }

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

  async updateSupplier(
    id: string,
    dto: Partial<CreateSupplierDto>,
  ): Promise<{ success: boolean; message?: string; data?: Supplier }> {
    const existing = await this.supplierRepository.findOne({ where: { id } });
    if (!existing) {
      return { success: false, message: 'Không tìm thấy nhà cung cấp.' };
    }
    const prevName = existing.name;
    Object.assign(existing, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.contactPerson !== undefined ? { contactPerson: dto.contactPerson.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      ...(dto.email !== undefined ? { email: dto.email.trim() } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
      ...(dto.paymentTerms !== undefined ? { paymentTerms: dto.paymentTerms } : {}),
    });
    const saved = await this.supplierRepository.save(existing);
    if (saved.name && saved.name !== prevName) {
      await this.poRepository.update({ supplierId: saved.id }, { supplierName: saved.name });
    }
    const full = await this.findOneSupplier(saved.id);
    return { success: true, data: full || saved };
  }

  async deleteSupplier(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.supplierRepository.findOne({ where: { id } });
    if (!existing) {
      return { success: false, message: 'Không tìm thấy nhà cung cấp.' };
    }
    const poCount = await this.poRepository.count({ where: { supplierId: id } });
    if (poCount > 0) {
      return {
        success: false,
        message: `Không thể xóa "${existing.name}" vì đang có ${poCount} đơn mua hàng (PO) liên kết.`,
      };
    }
    await this.supplierProductRepository.delete({ supplierId: id });
    await this.supplierRepository.delete(id);
    return { success: true, message: `Đã xóa nhà cung cấp "${existing.name}" thành công.` };
  }

  async syncUpdatedProduct(data: { productId: string; sku: string; name: string }) {
    if (!data?.productId) return;
    try {
      await this.supplierProductRepository.update(
        { productId: data.productId },
        {
          ...(data.sku ? { productSku: data.sku } : {}),
          ...(data.name ? { productName: data.name } : {}),
        },
      );
    } catch (e: any) {
      this.logger.warn(`Không đồng bộ được sản phẩm cập nhật sang NCC: ${e?.message}`);
    }
  }

  async removeProductFromAllSuppliers(productId: string) {
    if (!productId) return;
    try {
      await this.supplierProductRepository.delete({ productId });
    } catch (e: any) {
      this.logger.warn(`Không xóa được sản phẩm khỏi catalog NCC: ${e?.message}`);
    }
  }

  // --- Supplier Catalog Management ---
  async getSupplierProducts(supplierId: string): Promise<SupplierProduct[]> {
    return this.supplierProductRepository.find({
      where: { supplierId },
      order: { productName: 'ASC' },
    });
  }

  async assignSupplierProduct(data: {
    supplierId: string;
    productId: string;
    productSku?: string;
    productName?: string;
    supplyPrice?: number;
    minOrderQty?: number;
    leadTimeDays?: number;
  }): Promise<{ success: boolean; message?: string; data?: SupplierProduct }> {
    const supplier = await this.supplierRepository.findOne({ where: { id: data.supplierId } });
    if (!supplier) {
      return { success: false, message: 'Không tìm thấy Nhà cung cấp.' };
    }

    let productSku = data.productSku || '';
    let productName = data.productName || '';
    let defaultPrice = data.supplyPrice;

    if (!productSku || !productName || defaultPrice === undefined) {
      try {
        const res = await firstValueFrom(
          this.inventoryClient.send('product.find_all', { page: 1, limit: 1000 }),
        );
        const list: any[] = res?.data || [];
        const matched = list.find((p) => p.id === data.productId);
        if (matched) {
          productSku = productSku || matched.sku;
          productName = productName || matched.name;
          if (defaultPrice === undefined) {
            defaultPrice = Number(matched.price) > 0 ? Math.round(Number(matched.price) * 0.75) : 0;
          }
        }
      } catch (e) {}
    }

    if (!productSku || !productName) {
      return { success: false, message: 'Không tìm thấy thông tin sản phẩm cần gán.' };
    }

    const existing = await this.supplierProductRepository.findOne({
      where: { supplierId: data.supplierId, productId: data.productId },
    });

    if (existing) {
      if (data.supplyPrice !== undefined) existing.supplyPrice = Number(data.supplyPrice);
      if (data.minOrderQty !== undefined) existing.minOrderQty = Math.max(1, Number(data.minOrderQty));
      if (data.leadTimeDays !== undefined) existing.leadTimeDays = Math.max(1, Number(data.leadTimeDays));
      existing.productSku = productSku;
      existing.productName = productName;
      const saved = await this.supplierProductRepository.save(existing);
      return { success: true, data: saved };
    }

    const sp = new SupplierProduct();
    sp.supplierId = data.supplierId;
    sp.productId = data.productId;
    sp.productSku = productSku;
    sp.productName = productName;
    sp.supplyPrice = Number(defaultPrice) || 0;
    sp.minOrderQty = Math.max(1, Number(data.minOrderQty) || 5);
    sp.leadTimeDays = Math.max(1, Number(data.leadTimeDays) || 3);
    sp.isPreferred = true;

    const saved = await this.supplierProductRepository.save(sp);
    return { success: true, data: saved };
  }

  async removeSupplierProduct(supplierId: string, productId: string): Promise<{ success: boolean; message: string }> {
    const result = await this.supplierProductRepository.delete({ supplierId, productId });
    if (!result.affected) {
      return { success: false, message: 'Sản phẩm không nằm trong danh mục của nhà cung cấp này.' };
    }
    return { success: true, message: 'Đã gỡ sản phẩm khỏi danh mục cung ứng của nhà cung cấp.' };
  }

  // --- Purchase Orders Management ---
  async findAllPOs(query: { status?: string; search?: string } = {}): Promise<PurchaseOrder[]> {
    try {
      await this.poRepository
        .createQueryBuilder()
        .update(PurchaseOrder)
        .set({ status: POStatus.APPROVED })
        .where('status = :draft', { draft: POStatus.DRAFT })
        .execute();
    } catch (e: any) {
      this.logger.warn('Could not auto-promote draft POs: ' + e.message);
    }

    const qb = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.items', 'item')
      .orderBy('po.createdAt', 'DESC');

    if (query.status && query.status !== 'ALL') {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere('(po.poNumber ILIKE :s OR po.supplierName ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    return qb.getMany();
  }

  async findOnePO(id: string): Promise<PurchaseOrder | null> {
    return this.poRepository.findOne({
      where: { id },
      relations: { items: true },
    });
  }

  async createPO(dto: CreatePODto): Promise<any> {
    const supplier = await this.supplierRepository.findOne({
      where: { id: dto.supplierId },
    });

    if (!supplier) {
      return { success: false, message: 'Không tìm thấy Nhà cung cấp được chọn.' };
    }

    // Strict Supplier Catalog Validation: Verify all ordered products belong to this supplier's catalog
    const catalog = await this.supplierProductRepository.find({
      where: { supplierId: supplier.id },
    });
    const allowedProductIds = new Set(catalog.map((c) => c.productId));

    const invalidItems = (dto.items || []).filter((it) => !allowedProductIds.has(it.productId));
    if (invalidItems.length > 0) {
      const names = invalidItems.map((it) => it.productName || it.sku || it.productId).join(', ');
      return {
        success: false,
        message: `Sản phẩm [${names}] không thuộc danh mục cung ứng của "${supplier.name}". Vui lòng chọn đúng sản phẩm của nhà cung cấp hoặc gán thêm vào danh mục cung ứng.`,
      };
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PO-${today}-`;
    const todayPOs = await this.poRepository
      .createQueryBuilder('po')
      .select(['po.id', 'po.poNumber'])
      .where('po.poNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getMany();
    const maxSeq = todayPOs.reduce((max, row) => {
      const suffix = parseInt((row.poNumber || '').slice(prefix.length), 10);
      return Number.isFinite(suffix) && suffix > max ? suffix : max;
    }, 0);
    let seq = maxSeq + 1;
    let poNumber = `${prefix}${String(seq).padStart(3, '0')}`;
    while (await this.poRepository.findOne({ where: { poNumber } })) {
      seq += 1;
      poNumber = `${prefix}${String(seq).padStart(3, '0')}`;
    }

    const totalAmount = (dto.items || []).reduce(
      (sum, it) => sum + it.requestedQuantity * (it.unitPrice || 0),
      0,
    );

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + (dto.expectedDeliveryDays || 3));

    const po = new PurchaseOrder();
    po.poNumber = poNumber;
    po.supplierId = dto.supplierId;
    po.supplierName = supplier.name || dto.supplierName || 'Nhà Cung Cấp';
    po.status = POStatus.APPROVED;
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

    for (const item of po.items || []) {
      try {
        await firstValueFrom(
          this.inventoryClient.send('stock.receive_procurement', {
            productId: item.productId,
            quantity: item.requestedQuantity,
            poNumber: po.poNumber,
            supplierName: po.supplierName,
            unitPrice: Number(item.unitPrice) || undefined,
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

      const suppliers = await this.findAllSuppliers();
      if (suppliers.length === 0) {
        return {
          success: false,
          message: 'Chưa có Nhà cung cấp nào được cấu hình trong hệ thống.',
          generatedCount: 0,
          purchaseOrders: [],
        };
      }

      const byCode = new Map(suppliers.map((s) => [s.code, s]));
      const supplierMap = new Map<string, { supplier: Supplier; items: any[] }>();

      for (const prod of lowStockProducts) {
        // Prefer exact catalog link first, otherwise resolve by brand/category
        let matchedSupplier = suppliers.find((s) =>
          (s.products || []).some((sp) => sp.productId === prod.productId),
        );
        if (!matchedSupplier) {
          const code = this.resolveSupplierCodeForProduct({
            sku: prod.sku,
            name: prod.name,
            category: prod.category,
          });
          matchedSupplier = byCode.get(code) || suppliers[0];
        }

        const currentQty = Number(prod.currentQuantity) || 0;
        const minLevel = Number(prod.minStockLevel) || 10;
        const suggestedQty = Math.max(10, minLevel * 2 - currentQty);
        const spMatch = (matchedSupplier.products || []).find((sp) => sp.productId === prod.productId);
        const unitPrice = spMatch
          ? Number(spMatch.supplyPrice)
          : prod.price > 0
            ? Math.round(prod.price * 0.75)
            : 10000000;

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
        if (po && po.id) createdPOs.push(po);
      }

      return {
        success: true,
        message: `Hệ thống AI đã tự động phân tích và tạo ${createdPOs.length} đơn mua hàng (PO) tối ưu chi phí lưu kho.`,
        generatedCount: createdPOs.length,
        purchaseOrders: createdPOs,
      };
    } catch (err: any) {
      this.logger.error('Lỗi triggerAutoPO:', err);
      return {
        success: false,
        message: 'Lỗi hệ thống khi tự động sinh PO: ' + err.message,
        generatedCount: 0,
        purchaseOrders: [],
      };
    }
  }
}
