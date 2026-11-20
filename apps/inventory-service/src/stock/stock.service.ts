import { Injectable, Inject, Logger, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Inventory } from './entities/inventory.entity';
import { Product } from '../products/entities/product.entity';
import { Location, ZoneType, LocationStatus } from './entities/location.entity';
import { UpdateStockDto } from './dto/update-stock.dto';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { TransactionsService } from '../transactions/transactions.service';

const DEFAULT_ORDERING_COST = 50000;
const DEFAULT_HOLDING_COST_RATE = 0.2;
const DEFAULT_ANNUAL_DEMAND = 260;

@Injectable()
export class StockService implements OnModuleInit {
  private readonly logger = new Logger(StockService.name);
  private readonly forecastingServiceUrl: string;

  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('FORECASTING_SERVICE_HOST', 'localhost');
    const port = this.configService.get<number>('FORECASTING_SERVICE_PORT', 8004);
    this.forecastingServiceUrl = `http://${host}:${port}`;
  }

  async onModuleInit() {
    await this.seedLocations();
  }

  // Khởi tạo & Cập nhật lại 21 Tầng kệ theo mô hình Phân Khu > Kệ > Tầng chuẩn WMS trong Postgres DB
  async seedLocations() {
    try {
      this.logger.log('Updating Electronics WMS warehouse locations in-place (3 zones, 6 racks, 21 levels)...');

      const locationsToSeed: Partial<Location>[] = [
        // --- KHU NHẶT HÀNG NHANH (ZONE-HIGH-VAL) ---
        // Kệ A1 (Flagship Smartphone, Tablet)
        { code: 'A01', rack: 'Kệ A1', shelfLevel: 1, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 300, maxWeightKg: 500, description: 'Tầng 1 (Sát sàn) - Flagship iPhone 15 Pro Max & Galaxy S24 Ultra' },
        { code: 'A02', rack: 'Kệ A1', shelfLevel: 2, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 300, maxWeightKg: 500, description: 'Tầng 2 (Tầm mắt) - Smartphone cận cao cấp & Đồng hồ thông minh' },
        { code: 'A03', rack: 'Kệ A1', shelfLevel: 3, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 300, maxWeightKg: 400, description: 'Tầng 3 (Trên cao) - iPad Pro, Galaxy Tab & Máy bay Drone' },
        // Kệ A2 (Laptop Gaming, MacBook)
        { code: 'A04', rack: 'Kệ A2', shelfLevel: 1, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 250, maxWeightKg: 600, description: 'Tầng 1 (Sát sàn) - Laptop Gaming ASUS ROG, Acer Predator' },
        { code: 'A05', rack: 'Kệ A2', shelfLevel: 2, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 250, maxWeightKg: 500, description: 'Tầng 2 (Tầm mắt) - MacBook Pro, MacBook Air & Màn hình đồ họa' },
        { code: 'A06', rack: 'Kệ A2', shelfLevel: 3, aisle: 'A', zone: ZoneType.HIGH_VAL, maxCapacity: 300, maxWeightKg: 400, description: 'Tầng 3 (Trên cao) - Loa di động cao cấp & Thiết bị VR' },

        // --- KHU LUÂN CHUYỂN VỪA (ZONE-LARGE-APPLIANCE) ---
        // Kệ B1 (Dãy Trái - Smart TV & Loa Cỡ Lớn)
        { code: 'B01', rack: 'Kệ B1', shelfLevel: 1, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 80, maxWeightKg: 2500, description: 'Tầng 1 (Sát sàn) - Smart TV 75-85 inch & Dàn âm thanh lớn' },
        { code: 'B02', rack: 'Kệ B1', shelfLevel: 2, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 120, maxWeightKg: 2000, description: 'Tầng 2 (Tầm mắt) - Smart TV 55-65 inch & Soundbar' },
        { code: 'B03', rack: 'Kệ B1', shelfLevel: 3, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 150, maxWeightKg: 1500, description: 'Tầng 3 (Tầm trung) - Smart TV 43-50 inch & Máy chiếu 4K' },
        { code: 'B04', rack: 'Kệ B1', shelfLevel: 4, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 200, maxWeightKg: 1000, description: 'Tầng 4 (Trên cao) - Loa bluetooth công suất vừa & Amply' },
        // Kệ B2 (Dãy Phải - Điện Lạnh & Gia Dụng Cỡ Lớn)
        { code: 'B05', rack: 'Kệ B2', shelfLevel: 1, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 60, maxWeightKg: 2500, description: 'Tầng 1 (Sát sàn) - Tủ lạnh Side-by-side & Máy giặt lồng ngang' },
        { code: 'B06', rack: 'Kệ B2', shelfLevel: 2, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 80, maxWeightKg: 2000, description: 'Tầng 2 (Tầm mắt) - Tủ lạnh 2 cánh Inverter & Máy sấy quần áo' },
        { code: 'B07', rack: 'Kệ B2', shelfLevel: 3, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 100, maxWeightKg: 1500, description: 'Tầng 3 (Tầm trung) - Máy giặt lồng đứng & Máy lọc nước RO' },
        { code: 'B08', rack: 'Kệ B2', shelfLevel: 4, aisle: 'B', zone: ZoneType.LARGE_APPLIANCE, maxCapacity: 150, maxWeightKg: 1000, description: 'Tầng 4 (Trên cao) - Điều hòa không khí & Robot hút bụi' },

        // --- KHU MẬT ĐỘ CAO (ZONE-ACCESSORIES) ---
        // Kệ C (Phụ Kiện Bán Nhanh & Linh Kiện Đa Tầng)
        { code: 'C01', rack: 'Kệ C', shelfLevel: 1, aisle: 'C', zone: ZoneType.ACCESSORIES, maxCapacity: 500, maxWeightKg: 800, description: 'Tầng 1 (Sát sàn) - Cáp sạc bọc dù, hub chuyển đổi & phụ kiện cồng kềnh' },
        { code: 'C02', rack: 'Kệ C', shelfLevel: 2, aisle: 'C', zone: ZoneType.ACCESSORIES, maxCapacity: 600, maxWeightKg: 600, description: 'Tầng 2 (Tầm mắt) - Củ sạc nhanh GaN, pin dự phòng & sạc MagSafe' },
        { code: 'C03', rack: 'Kệ C', shelfLevel: 3, aisle: 'C', zone: ZoneType.ACCESSORIES, maxCapacity: 700, maxWeightKg: 500, description: 'Tầng 3 (Tầm trung) - Tai nghe không dây True Wireless & Ốp lưng' },
        { code: 'C04', rack: 'Kệ C', shelfLevel: 4, aisle: 'C', zone: ZoneType.ACCESSORIES, maxCapacity: 600, maxWeightKg: 500, description: 'Tầng 4 (Trên cao) - Chuột không dây, bàn phím cơ & USB/SSD' },
        // Kệ D (Kỹ Thuật, Thẩm Định Đổi Trả 30 Ngày & Hàng Bảo Hành - đặt trong Khu Mật Độ Cao)
        { code: 'D01', rack: 'Kệ D', shelfLevel: 1, aisle: 'D', zone: ZoneType.ACCESSORIES, maxCapacity: 150, maxWeightKg: 500, description: 'Tầng 1 (Bàn kỹ thuật) - Trạm thẩm định kiểm tra máy đổi trả 30 ngày' },
        { code: 'D02', rack: 'Kệ D', shelfLevel: 2, aisle: 'D', zone: ZoneType.ACCESSORIES, maxCapacity: 200, maxWeightKg: 500, description: 'Tầng 2 (Kệ an toàn) - Lưu trữ máy chờ gửi hãng bảo hành' },
        { code: 'D03', rack: 'Kệ D', shelfLevel: 3, aisle: 'D', zone: ZoneType.ACCESSORIES, maxCapacity: 200, maxWeightKg: 500, description: 'Tầng 3 (Kệ Open-Box) - Hàng mở hộp, máy trưng bày & thanh lý' },
      ];

      for (const target of locationsToSeed) {
        const existing = await this.locationRepository.findOne({ where: { code: target.code } });
        if (existing) {
          await this.locationRepository.update(existing.id, {
            zone: target.zone,
            aisle: target.aisle,
            rack: target.rack,
            shelfLevel: target.shelfLevel,
            maxCapacity: target.maxCapacity,
            maxWeightKg: target.maxWeightKg,
            description: target.description,
          });
        } else {
          await this.locationRepository.save(this.locationRepository.create(target));
        }
      }

      this.logger.log('Successfully updated & seeded 21 Electronics WMS shelf levels across 6 racks in 3 zones in-place.');
    } catch (err: any) {
      this.logger.warn(`Failed to seed warehouse locations: ${err.message}`);
    }
  }

  // Lấy toàn bộ danh sách Kệ kho kèm thông tin tải dung lượng thời gian thực
  async getAllLocationsWithOccupancy() {
    const locations = await this.locationRepository.find({ order: { code: 'ASC' } });
    const inventories = await this.inventoryRepository.find();

    const products = await this.productRepository.find();
    const productMap = new Map(products.map(p => [p.id, p]));

    // Map occupancy calculation
    return locations.map(loc => {
      const locInventories = inventories.filter(i => i.location === loc.code || i.locationId === loc.id);
      const currentItemsCount = locInventories.reduce((sum, i) => sum + (i.currentQuantity || 0), 0);
      
      const items = locInventories.map(i => {
        const prod = productMap.get(i.productId);
        return {
          inventoryId: i.id,
          productId: i.productId,
          productName: prod?.name || 'Unknown Product',
          productSku: prod?.sku || 'SKU',
          quantity: i.currentQuantity,
          price: prod?.price ? Number(prod.price) : 0,
          category: prod?.category || '',
          imageUrl: prod?.imageUrl || null,
        };
      }).filter(item => item.quantity > 0);

      const occupancyRate = loc.maxCapacity > 0 ? Math.min(100, Math.round((currentItemsCount / loc.maxCapacity) * 100)) : 0;
      const remainingCapacity = Math.max(0, loc.maxCapacity - currentItemsCount);

      return {
        ...loc,
        currentItemsCount,
        occupancyRate,
        remainingCapacity,
        items,
      };
    });
  }

  async getStock(productId: string): Promise<Inventory[]> {
    return this.inventoryRepository.find({ where: { productId } });
  }

  async updateStock(updateStockDto: UpdateStockDto): Promise<Inventory> {
    const { productId, quantityChange, location = 'C01' } = updateStockDto;

    // Link location record if code matches
    const locEntity = await this.locationRepository.findOne({ where: { code: location } });

    let inventory = await this.inventoryRepository.findOne({
      where: { productId, location }
    });

    if (!inventory) {
      if (quantityChange < 0) {
        throw new RpcException('Cannot reduce stock below 0 for non-existent inventory record');
      }
      inventory = this.inventoryRepository.create({
        productId,
        location,
        locationId: locEntity?.id,
        currentQuantity: quantityChange,
      });
      const savedNew = await this.inventoryRepository.save(inventory);
      await this.checkAndEmitAlert(productId, savedNew.currentQuantity);
      return savedNew;
    }

    if (inventory.currentQuantity + quantityChange < 0) {
      throw new RpcException('Insufficient stock');
    }

    inventory.currentQuantity += quantityChange;
    if (locEntity) inventory.locationId = locEntity.id;

    const savedUpdate = await this.inventoryRepository.save(inventory);
    await this.checkAndEmitAlert(productId, savedUpdate.currentQuantity);
    return savedUpdate;
  }

  // Thuật toán Gợi ý Vị trí Cất hàng Kho Bán Lẻ Điện Máy (TGDD & ĐMX Smart Putaway)
  async suggestPutaway(productId: string, quantity: number) {
    let product: Product | null = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
    if (isUuid) {
      product = await this.productRepository.findOne({ where: { id: productId } });
    } else {
      product = await this.productRepository.findOne({ where: { sku: productId } });
    }
    const locations = await this.getAllLocationsWithOccupancy();

    // Lựa chọn Zone & Kệ ưu tiên dựa trên mô hình phân khu kho Điện Máy (TGDD & ĐMX)
    let targetZone = ZoneType.ACCESSORIES;
    let preferredRack: string | null = null;

    if (product) {
      const name = (product.name || '').toLowerCase();
      const cat = (product.category || '').toLowerCase();

      // 1. Kiểm tra hàng đổi trả / bảo hành / máy cũ / open-box -> Kệ D trong Khu Mật Độ Cao
      if (
        name.includes('đổi trả') || name.includes('bảo hành') || name.includes('open-box') || 
        name.includes('trưng bày') || name.includes('mở hộp') || name.includes('cũ') || 
        name.includes('rma') || name.includes('lỗi') || cat.includes('đổi trả') || cat.includes('bảo hành') || cat.includes('rma')
      ) {
        targetZone = ZoneType.ACCESSORIES;
        preferredRack = 'Kệ D';
      } else if (
        name.includes('iphone') || name.includes('macbook') || name.includes('laptop') || 
        name.includes('ipad') || name.includes('galaxy') || name.includes('watch') || 
        name.includes('smartphone') || name.includes('điện thoại') || name.includes('tablet') || 
        name.includes('camera') || name.includes('drone') || name.includes('flycam') ||
        name.includes('redmi') || name.includes('xiaomi') || name.includes('oppo') || name.includes('vivo') ||
        cat.includes('điện thoại') || cat.includes('smartphone') || cat.includes('phone') ||
        cat.includes('laptop') || cat.includes('máy tính bảng') || cat.includes('tablet') || cat.includes('đồng hồ') || cat.includes('watch')
      ) {
        targetZone = ZoneType.HIGH_VAL; // Khu Nhặt Hàng Nhanh (Kệ A1, Kệ A2)
      } else if (
        name.includes('tv') || name.includes('tivi') || name.includes('tủ lạnh') || 
        name.includes('máy giặt') || name.includes('máy sấy') || name.includes('điều hòa') || 
        name.includes('máy lạnh') || name.includes('lọc nước') || name.includes('loa') || 
        name.includes('soundbar') || name.includes('ampli') || name.includes('amp') ||
        name.includes('dàn âm thanh') || name.includes('máy rửa') || name.includes('màn hình') ||
        cat.includes('tivi') || cat.includes('tv') || cat.includes('điện máy') || cat.includes('điện lạnh') ||
        cat.includes('gia dụng') || cat.includes('âm thanh') || cat.includes('audio') || cat.includes('giải trí')
      ) {
        targetZone = ZoneType.LARGE_APPLIANCE; // Khu Luân Chuyển Vừa (Kệ B1, Kệ B2)
      } else {
        targetZone = ZoneType.ACCESSORIES; // Khu Mật Độ Cao (Kệ C)
        preferredRack = 'Kệ C';
      }
    }

    // Tìm kệ còn đủ sức chứa: ưu tiên Kệ cụ thể (nếu có), rồi Zone ưu tiên, rồi bất kỳ kệ nào còn trống
    let candidate = preferredRack
      ? locations.find(l => l.rack === preferredRack && (l.maxCapacity - l.currentItemsCount) >= quantity && l.status === LocationStatus.ACTIVE)
      : null;

    if (!candidate) {
      candidate = locations.find(l => l.zone === targetZone && (l.maxCapacity - l.currentItemsCount) >= quantity && l.status === LocationStatus.ACTIVE);
    }
    
    if (!candidate) {
      candidate = locations.find(l => (l.maxCapacity - l.currentItemsCount) >= quantity && l.status === LocationStatus.ACTIVE);
    }

    const zoneNames: Record<string, string> = {
      [ZoneType.HIGH_VAL]: 'Khu Nhặt Hàng Nhanh (Công Nghệ Giá Trị Cao)',
      [ZoneType.LARGE_APPLIANCE]: 'Khu Luân Chuyển Vừa (Điện Máy & Điện Lạnh Cỡ Lớn)',
      [ZoneType.ACCESSORIES]: 'Khu Mật Độ Cao (Phụ Kiện & Kỹ Thuật)',
      'ZONE-SERVICE-RMA': 'Khu Mật Độ Cao (Phụ Kiện & Kỹ Thuật)',
      'ZONE-ESD-TEMP': 'Khu Mật Độ Cao (Phụ Kiện & Kỹ Thuật)',
    };

    const zoneLabel = candidate ? (zoneNames[candidate.zone] || candidate.zone) : 'Khu Mật Độ Cao (Phụ Kiện & Kỹ Thuật)';

    return {
      productId,
      productName: product?.name || 'Sản phẩm',
      suggestedLocation: candidate ? candidate.code : 'C01',
      zone: candidate ? candidate.zone : ZoneType.ACCESSORIES,
      zoneName: zoneLabel,
      rack: candidate?.rack || 'Kệ C',
      shelfLevel: candidate?.shelfLevel || 1,
      reason: candidate 
        ? `Đề xuất cất vào ${candidate.rack} - Tầng ${candidate.shelfLevel} [${candidate.code}] (${zoneLabel}) vì còn trống ${candidate.maxCapacity - candidate.currentItemsCount} vị trí.`
        : 'Sử dụng Tầng mặc định Kệ C - Tầng 1 [C01] do các tầng chuyên dụng khác đã đầy.',
    };
  }

  // Chuyển vị trí tồn kho giữa 2 Tầng Kệ kho (Stock Relocation)
  async relocateStock(dto: { productId: string; fromLocation: string; toLocation: string; quantity: number }) {
    const { productId, fromLocation, toLocation, quantity } = dto;
    if (quantity <= 0) throw new RpcException('Quantity must be greater than 0');

    const sourceInv = await this.inventoryRepository.findOne({ where: { productId, location: fromLocation } });
    if (!sourceInv || sourceInv.currentQuantity < quantity) {
      throw new RpcException(`Tồn kho tại Tầng [${fromLocation}] không đủ ${quantity} sản phẩm để chuyển.`);
    }

    // Giảm tầng cũ
    await this.updateStock({ productId, quantityChange: -quantity, location: fromLocation });
    // Tăng tầng mới
    await this.updateStock({ productId, quantityChange: quantity, location: toLocation });

    return {
      success: true,
      message: `Đã chuyển thành công ${quantity} sản phẩm từ Tầng [${fromLocation}] sang Tầng [${toLocation}].`,
    };
  }

  async createLocation(dto: Partial<Location>): Promise<Location> {
    if (!dto.code) throw new RpcException('Vui lòng nhập Mã Tầng kệ kho (ví dụ: A1-L4, B1-L4...).');
    const existing = await this.locationRepository.findOne({ where: { code: dto.code } });
    if (existing) throw new RpcException(`Mã vị trí [${dto.code}] đã tồn tại trong hệ thống.`);

    const newLoc = this.locationRepository.create({
      code: dto.code,
      zone: dto.zone || ZoneType.ACCESSORIES,
      aisle: dto.aisle || `Dãy ${dto.code[0]?.toUpperCase() || 'A'}`,
      rack: dto.rack || `Kệ ${dto.code.split('-')[0] || 'A1'}`,
      shelfLevel: Number(dto.shelfLevel) || 1,
      maxCapacity: Number(dto.maxCapacity) || 300,
      maxWeightKg: Number(dto.maxWeightKg) || 500,
      status: dto.status || LocationStatus.ACTIVE,
      description: dto.description || '',
    });

    return this.locationRepository.save(newLoc);
  }

  async updateLocation(id: string, dto: Partial<Location>): Promise<Location> {
    const loc = await this.locationRepository.findOne({ where: { id } });
    if (!loc) throw new RpcException('Không tìm thấy vị trí tầng kho.');

    if (dto.code && dto.code !== loc.code) {
      const existing = await this.locationRepository.findOne({ where: { code: dto.code } });
      if (existing) throw new RpcException(`Mã vị trí [${dto.code}] đã tồn tại trong hệ thống.`);
      loc.code = dto.code;
    }
    if (dto.zone) loc.zone = dto.zone;
    if (dto.aisle) loc.aisle = dto.aisle;
    if (dto.rack) loc.rack = dto.rack;
    if (dto.shelfLevel !== undefined) loc.shelfLevel = Number(dto.shelfLevel);
    if (dto.maxCapacity !== undefined) loc.maxCapacity = Number(dto.maxCapacity);
    if (dto.maxWeightKg !== undefined) loc.maxWeightKg = Number(dto.maxWeightKg);
    if (dto.status) loc.status = dto.status;
    if (dto.description !== undefined) loc.description = dto.description;

    return this.locationRepository.save(loc);
  }

  async deleteLocation(id: string): Promise<{ success: boolean; message: string }> {
    const loc = await this.locationRepository.findOne({ where: { id } });
    if (!loc) throw new RpcException('Không tìm thấy kệ kho.');

    const inventories = await this.inventoryRepository.find({ where: [{ location: loc.code }, { locationId: loc.id }] });
    const hasItems = inventories.some(i => i.currentQuantity > 0);
    if (hasItems) {
      throw new RpcException(`Không thể xóa Kệ [${loc.code}] vì vẫn đang lưu giữ hàng hóa. Vui lòng chuyển hàng đi trước khi xóa!`);
    }

    await this.locationRepository.remove(loc);
    return { success: true, message: `Đã xóa Kệ kho [${loc.code}] thành công.` };
  }

  private async estimateAnnualDemand(productId: string): Promise<number> {
    try {
      const result = await this.transactionsService.findByProduct(productId, 1, 100000);
      const transactions = result?.data || [];
      const outbound = transactions.filter((t) => t.type === 'OUTBOUND' && t.status === 'COMPLETED');
      if (outbound.length === 0) {
        return DEFAULT_ANNUAL_DEMAND;
      }
      const totalQty = outbound.reduce((sum, t) => sum + (t.quantity || 0), 0);
      const timestamps = outbound.map((t) => new Date(t.createdAt).getTime());
      const spanDays = Math.max(1, (Date.now() - Math.min(...timestamps)) / 86400000);
      return Math.max(1, (totalQty / spanDays) * 365);
    } catch (e: any) {
      this.logger.warn(`Could not reach TransactionsService to estimate demand for ${productId}: ${e?.message || e}`);
      return DEFAULT_ANNUAL_DEMAND;
    }
  }

  async calculateEOQ(product: Product): Promise<{ eoq: number; annualDemand: number }> {
    const orderingCost = Number(product.orderingCost) || DEFAULT_ORDERING_COST;
    const holdingCostRate = Number(product.holdingCostRate) || DEFAULT_HOLDING_COST_RATE;
    const unitPrice = Number(product.price) || 1;

    try {
      const { data } = await axios.get(`${this.forecastingServiceUrl}/eoq/${product.id}`, {
        params: {
          ordering_cost: orderingCost,
          holding_cost_rate: holdingCostRate,
          unit_price: unitPrice,
        },
        timeout: 5000,
      });
      return { eoq: Math.round(data.eoq), annualDemand: Math.round(data.annualDemand) };
    } catch (e: any) {
      this.logger.warn(`Forecasting Service không phản hồi, dùng công thức EOQ dự phòng tại chỗ: ${e?.message || e}`);
    }

    const annualDemand = await this.estimateAnnualDemand(product.id);
    const holdingCost = holdingCostRate * unitPrice;
    const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
    return { eoq: Math.round(eoq), annualDemand: Math.round(annualDemand) };
  }

  async getInventoryDecision(
    productId: string,
    options?: { leadTimeDays?: number; serviceLevel?: number; horizonDays?: number }
  ) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new RpcException('Không tìm thấy sản phẩm');
    }

    const leadTimeDays = Math.max(1, Number(options?.leadTimeDays) || 7);
    const serviceLevel = Number(options?.serviceLevel) || 0.95;
    const horizonDays = Math.max(1, Number(options?.horizonDays) || 7);

    // Z-score mapping (Phân phối chuẩn hóa theo mức phục vụ)
    let zScore = 1.65; // Mặc định 95%
    if (serviceLevel >= 0.99) zScore = 2.33;
    else if (serviceLevel >= 0.95) zScore = 1.65;
    else if (serviceLevel >= 0.90) zScore = 1.28;
    else if (serviceLevel >= 0.85) zScore = 1.04;

    // 1. Tồn kho hiện tại (On-hand)
    const records = await this.getStock(productId);
    const onHandStock = records.reduce((sum, r) => sum + (r.currentQuantity || 0), 0);

    // 2. Hàng đang trên đường về (Inbound pending)
    let inboundStock = 0;
    try {
      const txResult = await this.transactionsService.findByProduct(productId, 1, 100);
      const transactions = txResult?.data || [];
      const inboundPending = transactions.filter((t: any) => t.type === 'INBOUND' && t.status === 'PENDING');
      inboundStock = inboundPending.reduce((sum: number, t: any) => sum + (Number(t.quantity) || 0), 0);
    } catch (e: any) {
      this.logger.warn(`Could not fetch pending inbound for ${productId}: ${e?.message || e}`);
    }

    const availableStock = onHandStock + inboundStock;

    // 3. Lấy dữ liệu dự báo từ Forecasting Service
    let forecastList: Array<{ date: string; predictedQuantity: number }> = [];
    try {
      const { data } = await axios.get(`${this.forecastingServiceUrl}/forecast/${productId}`, {
        params: { days: horizonDays },
        timeout: 5000,
      });
      forecastList = data?.forecast || [];
    } catch (e: any) {
      this.logger.warn(`Forecasting Service unavailable for decision, fallback to local estimate: ${e?.message || e}`);
    }

    let avgDailyDemand = 0;
    let stdDailyDemand = 0;
    let totalForecastDemand = 0;

    if (forecastList.length > 0) {
      const quantities = forecastList.map((f) => Number(f.predictedQuantity) || 0);
      totalForecastDemand = quantities.reduce((a, b) => a + b, 0);
      avgDailyDemand = totalForecastDemand / quantities.length;
      if (quantities.length > 1) {
        const variance = quantities.reduce((sum, q) => sum + Math.pow(q - avgDailyDemand, 2), 0) / (quantities.length - 1);
        stdDailyDemand = Math.sqrt(variance);
      }
    } else {
      const estimatedAnnual = await this.estimateAnnualDemand(productId);
      avgDailyDemand = estimatedAnnual / 365;
      stdDailyDemand = avgDailyDemand * 0.25;
      totalForecastDemand = avgDailyDemand * horizonDays;
    }

    if (stdDailyDemand === 0 && avgDailyDemand > 0) {
      stdDailyDemand = avgDailyDemand * 0.2;
    }

    // 4. Các công thức Quản trị Tồn kho lý thuyết (Mục 2.5 & 3.4 PDF)
    // Safety Stock (SS) = Z * sigma_d * sqrt(L)
    const safetyStock = Math.ceil(zScore * stdDailyDemand * Math.sqrt(leadTimeDays));

    // Reorder Point (ROP) = (avgDailyDemand * L) + Safety Stock
    const leadTimeDemand = avgDailyDemand * leadTimeDays;
    const reorderPoint = Math.ceil(leadTimeDemand + safetyStock);

    // EOQ (Lượng đặt hàng kinh tế)
    const orderingCost = Number(product.orderingCost) || DEFAULT_ORDERING_COST;
    const holdingCostRate = Number(product.holdingCostRate) || DEFAULT_HOLDING_COST_RATE;
    const unitPrice = Number(product.price) || 1;
    const annualDemand = Math.max(1, avgDailyDemand * 365);
    const holdingCostPerUnit = holdingCostRate * unitPrice;
    const eoq = Math.round(Math.sqrt((2 * annualDemand * orderingCost) / Math.max(0.0001, holdingCostPerUnit)));

    // Projected Stock = onHandStock + inboundStock - totalForecastDemand
    const projectedStock = Math.round((onHandStock + inboundStock - totalForecastDemand) * 10) / 10;

    // 5. Đánh giá trạng thái & Phân loại rủi ro (Risk Alert)
    let status: 'CRITICAL_STOCKOUT' | 'BELOW_ROP' | 'OPTIMAL' | 'OVERSTOCK' = 'OPTIMAL';
    let badgeColor = '#10b981'; // Green
    let title = 'Tồn kho an toàn & Tối ưu';
    let message = `Tồn khả dụng (${availableStock}) cao hơn điểm đặt hàng lại ROP (${reorderPoint}). Đáp ứng tốt nhu cầu dự báo.`;
    let isReorderNeeded = false;
    let recommendedOrderQuantity = 0;

    if (projectedStock <= 0) {
      status = 'CRITICAL_STOCKOUT';
      badgeColor = '#ef4444'; // Red
      title = 'Nguy cơ đứt hàng trầm trọng (Stockout Risk)';
      message = `Tồn kho dự phóng (${projectedStock}) sẽ bị âm trong ${horizonDays} ngày tới do nhu cầu dự báo (${totalForecastDemand.toFixed(1)}) vượt quá lượng hàng có sẵn (${availableStock}).`;
      isReorderNeeded = true;
      recommendedOrderQuantity = Math.max(eoq, Math.ceil(Math.abs(projectedStock) + safetyStock));
    } else if (availableStock <= reorderPoint) {
      status = 'BELOW_ROP';
      badgeColor = '#f59e0b'; // Amber/Orange
      title = 'Dưới ngưỡng đặt hàng (Below ROP)';
      message = `Tồn khả dụng (${availableStock}) đã giảm xuống dưới Điểm đặt hàng lại ROP (${reorderPoint}). Cần kích hoạt đặt hàng bổ sung theo chính sách.`;
      isReorderNeeded = true;
      recommendedOrderQuantity = eoq;
    } else if (onHandStock > 3 * (avgDailyDemand * 30) && onHandStock > 50) {
      status = 'OVERSTOCK';
      badgeColor = '#8b5cf6'; // Purple
      title = 'Cảnh báo dư thừa tồn kho (Overstock)';
      message = `Tồn kho hiện tại (${onHandStock}) vượt quá nhu cầu tiêu thụ của 3 tháng tới. Khuyến nghị giảm nhập hoặc điều chuyển kho để tối ưu vốn.`;
      isReorderNeeded = false;
      recommendedOrderQuantity = 0;
    }

    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      currentStock: onHandStock,
      inboundStock,
      availableStock,
      leadTimeDays,
      serviceLevel,
      zScore,
      forecast: {
        horizonDays,
        avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
        stdDailyDemand: Math.round(stdDailyDemand * 100) / 100,
        totalForecastDemand: Math.round(totalForecastDemand * 100) / 100,
        predictedDaily: forecastList,
      },
      inventoryPolicy: {
        safetyStock,
        reorderPoint,
        leadTimeDemand: Math.round(leadTimeDemand * 10) / 10,
        eoq,
        annualDemand: Math.round(annualDemand),
        orderingCost,
        holdingCostRate,
        holdingCostPerUnit: Math.round(holdingCostPerUnit),
        projectedStock,
      },
      riskAlert: {
        status,
        badgeColor,
        title,
        message,
        isReorderNeeded,
        recommendedOrderQuantity,
      },
    };
  }

  async getReorderInfo(productId: string) {
    const decision = await this.getInventoryDecision(productId);
    return {
      productId: decision.productId,
      currentStock: decision.currentStock,
      inboundStock: decision.inboundStock,
      availableStock: decision.availableStock,
      safetyStock: decision.inventoryPolicy.safetyStock,
      reorderPoint: decision.inventoryPolicy.reorderPoint,
      eoq: decision.inventoryPolicy.eoq,
      annualDemand: decision.inventoryPolicy.annualDemand,
      projectedStock: decision.inventoryPolicy.projectedStock,
      lowStock: decision.riskAlert.isReorderNeeded,
      status: decision.riskAlert.status,
      riskAlert: decision.riskAlert,
    };
  }

  private async checkAndEmitAlert(productId: string, currentQuantity: number) {
    try {
      const decision = await this.getInventoryDecision(productId);
      if (decision.riskAlert.isReorderNeeded) {
        this.logger.log(`Stock (${currentQuantity}) below ROP threshold (${decision.inventoryPolicy.reorderPoint}) for ${decision.productName}, emitting alert.`);
        this.notificationClient.emit('product.stock.changed', {
          productId,
          productName: decision.productName,
          newStock: currentQuantity,
          threshold: decision.inventoryPolicy.reorderPoint,
          safetyStock: decision.inventoryPolicy.safetyStock,
          recommendedOrderQuantity: decision.riskAlert.recommendedOrderQuantity,
          alertType: decision.riskAlert.status,
          message: decision.riskAlert.message,
        });
      }
    } catch (error: any) {
      this.logger.warn(`checkAndEmitAlert thất bại cho product ${productId}: ${error?.message || error}`);
    }
  }

  async getUnallocatedProducts() {
    const products = await this.productRepository.find();
    const locations = await this.locationRepository.find();
    const validLocCodes = new Set(locations.map(l => l.code));
    const inventories = await this.inventoryRepository.find();

    const result: any[] = [];

    for (const p of products) {
      const pInventories = inventories.filter(i => i.productId === p.id);
      
      const allocatedQty = pInventories
        .filter(i => validLocCodes.has(i.location))
        .reduce((sum, i) => sum + (i.currentQuantity || 0), 0);

      const totalStock = pInventories.reduce((sum, i) => sum + (i.currentQuantity || 0), 0);
      const unallocatedQty = Math.max(0, totalStock - allocatedQty);

      if (unallocatedQty > 0 || allocatedQty === 0) {
        const finalUnallocated = unallocatedQty > 0 ? unallocatedQty : (totalStock > 0 ? totalStock : 0);
        if (finalUnallocated > 0) {
          result.push({
            productId: p.id,
            sku: p.sku,
            name: p.name,
            category: p.category,
            unit: p.unit || 'Chiếc',
            imageUrl: p.imageUrl,
            price: p.price,
            totalStock,
            allocatedQty,
            unallocatedQty: finalUnallocated,
          });
        }
      }
    }

    return result;
  }
}
