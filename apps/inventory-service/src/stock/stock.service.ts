import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
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
    @Inject('TRANSACTION_SERVICE') private readonly transactionClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('FORECASTING_SERVICE_HOST', 'localhost');
    const port = this.configService.get<number>('FORECASTING_SERVICE_PORT', 8004);
    this.forecastingServiceUrl = `http://${host}:${port}`;
  }

  async onModuleInit() {
    await this.seedLocations();
  }

  // Khởi tạo & Cập nhật lại 20 Kệ kho điện tử đầy đủ trong Postgres DB
  async seedLocations() {
    try {
      this.logger.log('Updating Electronics WMS warehouse locations in-place (20 full racks)...');

      const locationsToSeed: Partial<Location>[] = [
        // Dãy A: ZONE-HIGH-VAL (Khu Hàng Giá Trị Cao: Laptop, Smartphone, Tablet, Drone) - 6 Kệ
        { code: 'A01', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Tủ kính an ninh cao - Hàng công nghệ đắt tiền' },
        { code: 'A02', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Tủ kính an ninh cao - Smartphone & Tablet' },
        { code: 'A03', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Kệ an toàn - Laptop & MacBook' },
        { code: 'A04', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Kệ an toàn - Camera & Drone' },
        { code: 'A05', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Tủ kính bảo vệ - Đồng hồ thông minh & Smartwatch' },
        { code: 'A06', zone: ZoneType.HIGH_VAL, aisle: 'A', maxCapacity: 300, maxWeightKg: 500, description: 'Kệ khóa từ - Máy đọc sách & Thiết bị VR' },

        // Dãy B: ZONE-LARGE-APPLIANCE (Khu Điện Tử Cỡ Lớn: Smart TV, Loa, Máy chiếu) - 8 Kệ (4 Trái, 4 Phải)
        { code: 'B01', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Pallet tầng trệt - Smart TV 65-85 inch' },
        { code: 'B02', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Pallet tầng trệt - Loa Soundbar & Ampli lớn' },
        { code: 'B03', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Kệ khung thép chịu tải - Màn hình đồ họa cỡ lớn' },
        { code: 'B04', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Kệ khung thép chịu tải - Dàn âm thanh gia đình' },
        { code: 'B05', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Pallet tầng trệt - Máy chiếu & Màn chiếu công nghiệp' },
        { code: 'B06', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Kệ chịu tải lớn - Tủ lạnh mini & Máy lọc không khí' },
        { code: 'B07', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Kệ khung thép - Ghế massage & Thiết bị tập thông minh' },
        { code: 'B08', zone: ZoneType.LARGE_APPLIANCE, aisle: 'B', maxCapacity: 100, maxWeightKg: 2500, description: 'Pallet hạ tầng - Máy hút bụi lau nhà Robot' },

        // Dãy C: ZONE-ACCESSORIES (Khu Linh Kiện & Phụ Kiện: Bàn phím, Chuột, RAM/SSD) - 4 Kệ
        { code: 'C01', zone: ZoneType.ACCESSORIES, aisle: 'C', maxCapacity: 500, maxWeightKg: 800, description: 'Kệ đa tầng High-Bay - Bàn phím cơ & Chuột Gaming' },
        { code: 'C02', zone: ZoneType.ACCESSORIES, aisle: 'C', maxCapacity: 500, maxWeightKg: 800, description: 'Kệ đa tầng High-Bay - Tai nghe Bluetooth & Củ sạc' },
        { code: 'C03', zone: ZoneType.ACCESSORIES, aisle: 'C', maxCapacity: 500, maxWeightKg: 800, description: 'Kệ mật độ cao - Cáp sạc & Hub chuyển đổi' },
        { code: 'C04', zone: ZoneType.ACCESSORIES, aisle: 'C', maxCapacity: 500, maxWeightKg: 800, description: 'Kệ mật độ cao - Ổ cứng di động & Ổ SSD/RAM' },

        // Dãy D: ZONE-ESD-TEMP (Khu Chống Tĩnh Điện & Bán Dẫn: Bo mạch, Chipset, Cảm biến) - 2 Kệ
        { code: 'D01', zone: ZoneType.ESD_TEMP, aisle: 'D', maxCapacity: 200, maxWeightKg: 600, description: 'Phòng ESD kiểm soát độ ẩm - Chipset & CPU' },
        { code: 'D02', zone: ZoneType.ESD_TEMP, aisle: 'D', maxCapacity: 200, maxWeightKg: 600, description: 'Phòng ESD kiểm soát nhiệt độ - Bo mạch chủ Mainboard' },
      ];

      const existingLocs = await this.locationRepository.find({ order: { createdAt: 'ASC' } });

      for (let i = 0; i < locationsToSeed.length; i++) {
        const target = locationsToSeed[i];
        if (existingLocs[i]) {
          await this.locationRepository.update(existingLocs[i].id, target);
        } else {
          await this.locationRepository.save(this.locationRepository.create(target));
        }
      }

      // If leftover extra locations exist, attempt delete
      if (existingLocs.length > locationsToSeed.length) {
        for (let i = locationsToSeed.length; i < existingLocs.length; i++) {
          await this.locationRepository.delete(existingLocs[i].id).catch(() => {});
        }
      }

      this.logger.log('Successfully updated & seeded 20 Electronics WMS locations in-place.');
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
      
      const items = locInventories.map(i => ({
        inventoryId: i.id,
        productId: i.productId,
        productName: productMap.get(i.productId)?.name || 'Unknown Product',
        productSku: productMap.get(i.productId)?.sku || 'SKU',
        quantity: i.currentQuantity,
      })).filter(item => item.quantity > 0);

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

  // Thuật toán Gợi ý Vị trí Cất hàng Kho Thiết Bị Điện Tử (Smart Electronics Putaway)
  async suggestPutaway(productId: string, quantity: number) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    const locations = await this.getAllLocationsWithOccupancy();

    // Lựa chọn Zone ưu tiên dựa trên chủng loại thiết bị điện tử
    let targetZone = ZoneType.ACCESSORIES;
    if (product) {
      const name = product.name.toLowerCase();
      const cat = (product.category || '').toLowerCase();
      if (name.includes('iphone') || name.includes('macbook') || name.includes('laptop') || name.includes('ipad') || name.includes('drone') || name.includes('camera') || name.includes('điện thoại')) {
        targetZone = ZoneType.HIGH_VAL; // Dãy A (Khu Hàng Giá Trị Cao)
      } else if (name.includes('tv') || name.includes('tivi') || name.includes('màn hình') || name.includes('loa') || name.includes('âm thanh') || cat.includes('thiết bị lớn')) {
        targetZone = ZoneType.LARGE_APPLIANCE; // Dãy B (Khu Điện Tử Cỡ Lớn)
      } else if (name.includes('chip') || name.includes('mainboard') || name.includes('bo mạch') || name.includes('cảm biến') || name.includes('vi mạch')) {
        targetZone = ZoneType.ESD_TEMP; // Dãy D (Khu Chống Tĩnh Điện & Bán Dẫn)
      }
    }

    // Tìm kệ còn đủ sức chứa trong Zone ưu tiên
    let candidate = locations.find(l => l.zone === targetZone && (l.maxCapacity - l.currentItemsCount) >= quantity && l.status === LocationStatus.ACTIVE);
    
    // Nếu Zone ưu tiên hết chỗ, chọn Kệ bất kỳ còn trống
    if (!candidate) {
      candidate = locations.find(l => (l.maxCapacity - l.currentItemsCount) >= quantity && l.status === LocationStatus.ACTIVE);
    }

    const zoneNames: Record<string, string> = {
      [ZoneType.HIGH_VAL]: 'Khu Hàng Giá Trị Cao',
      [ZoneType.LARGE_APPLIANCE]: 'Khu Điện Tử Cỡ Lớn',
      [ZoneType.ACCESSORIES]: 'Khu Linh Kiện & Phụ Kiện',
      [ZoneType.ESD_TEMP]: 'Khu Chống Tĩnh Điện ESD',
    };

    const zoneLabel = candidate ? (zoneNames[candidate.zone] || candidate.zone) : 'Khu Linh Kiện & Phụ Kiện';

    return {
      productId,
      productName: product?.name || 'Sản phẩm',
      suggestedLocation: candidate ? candidate.code : 'C01',
      zone: candidate ? candidate.zone : ZoneType.ACCESSORIES,
      zoneName: zoneLabel,
      reason: candidate 
        ? `Đề xuất cất vào Kệ [${candidate.code}] thuộc Dãy ${candidate.aisle} (${zoneLabel}) vì còn trống ${candidate.maxCapacity - candidate.currentItemsCount} vị trí.`
        : 'Sử dụng kệ phụ kiện mặc định C01 do các kệ chuyên dụng khác đã đầy.',
    };
  }

  // Chuyển vị trí tồn kho giữa 2 Kệ hàng (Stock Relocation)
  async relocateStock(dto: { productId: string; fromLocation: string; toLocation: string; quantity: number }) {
    const { productId, fromLocation, toLocation, quantity } = dto;
    if (quantity <= 0) throw new RpcException('Quantity must be greater than 0');

    const sourceInv = await this.inventoryRepository.findOne({ where: { productId, location: fromLocation } });
    if (!sourceInv || sourceInv.currentQuantity < quantity) {
      throw new RpcException(`Tồn kho tại kệ [${fromLocation}] không đủ ${quantity} sản phẩm để chuyển.`);
    }

    // Giảm kệ cũ
    await this.updateStock({ productId, quantityChange: -quantity, location: fromLocation });
    // Tăng kệ mới
    await this.updateStock({ productId, quantityChange: quantity, location: toLocation });

    return {
      success: true,
      message: `Đã chuyển thành công ${quantity} sản phẩm từ kệ [${fromLocation}] sang kệ [${toLocation}].`,
    };
  }

  async createLocation(dto: Partial<Location>): Promise<Location> {
    if (!dto.code) throw new RpcException('Vui lòng nhập Mã Kệ kho (ví dụ: A07, B09...).');
    const existing = await this.locationRepository.findOne({ where: { code: dto.code } });
    if (existing) throw new RpcException(`Mã kệ [${dto.code}] đã tồn tại trong hệ thống.`);

    const newLoc = this.locationRepository.create({
      code: dto.code,
      zone: dto.zone || ZoneType.ACCESSORIES,
      aisle: dto.aisle || `Dãy ${dto.code[0]?.toUpperCase() || 'A'}`,
      maxCapacity: Number(dto.maxCapacity) || 300,
      maxWeightKg: Number(dto.maxWeightKg) || 500,
      status: dto.status || LocationStatus.ACTIVE,
      description: dto.description || '',
    });

    return this.locationRepository.save(newLoc);
  }

  async updateLocation(id: string, dto: Partial<Location>): Promise<Location> {
    const loc = await this.locationRepository.findOne({ where: { id } });
    if (!loc) throw new RpcException('Không tìm thấy kệ kho.');

    if (dto.code && dto.code !== loc.code) {
      const existing = await this.locationRepository.findOne({ where: { code: dto.code } });
      if (existing) throw new RpcException(`Mã kệ [${dto.code}] đã tồn tại trong hệ thống.`);
      loc.code = dto.code;
    }
    if (dto.zone) loc.zone = dto.zone;
    if (dto.aisle) loc.aisle = dto.aisle;
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
      const result = await firstValueFrom(
        this.transactionClient.send('transaction.findByProduct', { productId, page: 1, limit: 100000 }),
      );
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
      this.logger.warn(`Could not reach Transaction Service to estimate demand for ${productId}: ${e?.message || e}`);
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

  async getReorderInfo(productId: string) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new RpcException('Product not found');
    }
    const records = await this.getStock(productId);
    const currentStock = records.reduce((sum, r) => sum + (r.currentQuantity || 0), 0);
    const { eoq, annualDemand } = await this.calculateEOQ(product);

    return {
      productId,
      currentStock,
      eoq,
      annualDemand,
      lowStock: currentStock < eoq,
    };
  }

  private async checkAndEmitAlert(productId: string, currentQuantity: number) {
    try {
      const product = await this.productRepository.findOne({ where: { id: productId } });
      if (!product) return;

      const { eoq } = await this.calculateEOQ(product);
      if (currentQuantity < eoq) {
        this.logger.log(`Stock (${currentQuantity}) below EOQ threshold (${eoq}) for ${product.name}, emitting alert.`);
        this.notificationClient.emit('product.stock.changed', {
          productId,
          productName: product.name,
          newStock: currentQuantity,
          threshold: eoq,
          alertType: 'LOW_STOCK',
        });
      }
    } catch (error: any) {
      this.logger.warn(`checkAndEmitAlert thất bại cho product ${productId}: ${error?.message || error}`);
    }
  }
}
