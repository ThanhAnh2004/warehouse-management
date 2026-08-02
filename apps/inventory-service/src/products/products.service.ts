import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { Inventory } from '../stock/entities/inventory.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  async onModuleInit() {
    await this.seed50Products();
  }

  async seed50Products() {
    try {
      const count = await this.productRepository.count();
      if (count >= 40) {
        this.logger.log(`Skipping 50 products seed, database already has ${count} products.`);
        return;
      }

      this.logger.log('Seeding 50 Electronics Megastore products into PostgreSQL DB...');

      const sampleProducts = [
        // 1. Điện thoại & Tablet (PHONE_TABLET) -> Dãy A
        { sku: 'APP-IP15PM-256', name: 'iPhone 15 Pro Max 256GB VN/A', price: 34990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400', minStockLevel: 15, location: 'A01', quantity: 85 },
        { sku: 'SAM-S24U-512', name: 'Samsung Galaxy S24 Ultra 512GB', price: 37490000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400', minStockLevel: 10, location: 'A02', quantity: 60 },
        { sku: 'APP-IPAD-M4-256', name: 'iPad Pro M4 11 inch 256GB Wi-Fi', price: 28990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400', minStockLevel: 10, location: 'A02', quantity: 45 },
        { sku: 'XIA-14U-512', name: 'Xiaomi 14 Ultra 512GB Leica', price: 32990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400', minStockLevel: 10, location: 'A02', quantity: 30 },
        { sku: 'OPP-N3-FLIP', name: 'OPPO Find N3 Flip 256GB', price: 22990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400', minStockLevel: 8, location: 'A02', quantity: 25 },
        { sku: 'VIV-X100-PRO', name: 'Vivo X100 Pro 512GB Zeiss', price: 24990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400', minStockLevel: 8, location: 'A02', quantity: 20 },
        { sku: 'SAM-TAB-S9U', name: 'Samsung Galaxy Tab S9 Ultra 512GB', price: 30990000, category: 'Điện thoại & Tablet', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400', minStockLevel: 10, location: 'A02', quantity: 35 },

        // 2. Laptop & Máy tính (LAPTOP_PC) -> Dãy A
        { sku: 'APP-MBP16-M3MAX', name: 'MacBook Pro 16 inch M3 Max 36GB/1TB', price: 89990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400', minStockLevel: 5, location: 'A03', quantity: 18 },
        { sku: 'ASU-ROG-SCAR18', name: 'ASUS ROG Strix SCAR 18 i9-14900HX/RTX4090', price: 115990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=400', minStockLevel: 5, location: 'A03', quantity: 12 },
        { sku: 'DEL-XPS16-9640', name: 'Dell XPS 16 9640 Core Ultra 7/32GB/1TB', price: 68990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=400', minStockLevel: 5, location: 'A03', quantity: 22 },
        { sku: 'LEN-X1-CARB12', name: 'Lenovo ThinkPad X1 Carbon Gen 12', price: 54990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=400', minStockLevel: 5, location: 'A03', quantity: 20 },
        { sku: 'ACE-HELIOS16', name: 'Acer Predator Helios 16 i9/32GB/RTX4080', price: 62990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=400', minStockLevel: 5, location: 'A04', quantity: 15 },
        { sku: 'HPP-SPECTRE14', name: 'HP Spectre x360 14 OLED Touch', price: 46990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400', minStockLevel: 5, location: 'A04', quantity: 14 },
        { sku: 'APP-MAC-STUDIO', name: 'Mac Studio M2 Ultra 64GB/1TB SSD', price: 109990000, category: 'Laptop & Máy tính', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400', minStockLevel: 3, location: 'A04', quantity: 8 },

        // 3. Tivi & Thiết bị giải trí (TV_ENTERTAINMENT) -> Dãy B
        { sku: 'LG-OLED65C3', name: 'Smart TV OLED LG 4K 65 inch OLED65C3PSA', price: 44990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400', minStockLevel: 5, location: 'B01', quantity: 35 },
        { sku: 'SAM-QA75QN85C', name: 'Smart TV Neo QLED Samsung 4K 75 inch', price: 58990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1577979749830-f1d742b96791?w=400', minStockLevel: 5, location: 'B01', quantity: 28 },
        { sku: 'SON-65X85L', name: 'TV Sony Google TV 4K 65 inch KD-65X85L', price: 26990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400', minStockLevel: 5, location: 'B02', quantity: 40 },
        { sku: 'XGI-HORIZON-4K', name: 'Máy chiếu thông minh XGIMI Horizon Ultra 4K', price: 42990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=400', minStockLevel: 5, location: 'B02', quantity: 15 },
        { sku: 'JBL-BAR1000', name: 'Loa Soundbar JBL Bar 1000 7.1.4ch 880W', price: 24990000, category: 'Tivi & Thiết bị giải trí', unit: 'Bộ', imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400', minStockLevel: 5, location: 'B03', quantity: 25 },
        { sku: 'DEN-AVR-X2800H', name: 'Ampli Receiver Denon AVR-X2800H 7.2ch', price: 21990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400', minStockLevel: 5, location: 'B03', quantity: 18 },
        { sku: 'ASU-PROART32', name: 'Màn hình đồ họa ASUS ProArt 32 inch 4K HDR', price: 36990000, category: 'Tivi & Thiết bị giải trí', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400', minStockLevel: 5, location: 'B04', quantity: 22 },

        // 4. Tủ lạnh & Điện lạnh (REFRIGERATOR_COOLING) -> Dãy B
        { sku: 'SAM-RS64R5301', name: 'Tủ lạnh Side by Side Samsung Inverter 648L', price: 28990000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=400', minStockLevel: 5, location: 'B05', quantity: 24 },
        { sku: 'PAN-NR-BX471', name: 'Tủ lạnh Panasonic Inverter 417L Ngăn đá dưới', price: 18490000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400', minStockLevel: 5, location: 'B05', quantity: 30 },
        { sku: 'LGG-INSTAVIEW601', name: 'Tủ lạnh LG Inverter InstaView Door-in-Door 601L', price: 42990000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=400', minStockLevel: 5, location: 'B06', quantity: 16 },
        { sku: 'HIT-FW690PGV7', name: 'Tủ lạnh Hitachi Inverter 540L 4 Cửa', price: 29990000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400', minStockLevel: 5, location: 'B06', quantity: 20 },
        { sku: 'SAN-VH-408WL', name: 'Tủ mát Sanaky 350L Cửa kính tiết kiệm điện', price: 10990000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=400', minStockLevel: 5, location: 'B07', quantity: 35 },
        { sku: 'SAN-VH-3699A1', name: 'Tủ đông Sanaky 280L Dàn đồng', price: 7890000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400', minStockLevel: 5, location: 'B07', quantity: 40 },
        { sku: 'ARI-AURES-4500W', name: 'Máy nước nóng trực tiếp Ariston 4500W Bơm trợ lực', price: 3490000, category: 'Tủ lạnh & Điện lạnh', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=400', minStockLevel: 10, location: 'B08', quantity: 50 },

        // 5. Máy giặt & Gia dụng lớn (WASHING_APPLIANCE) -> Dãy B
        { sku: 'ELE-EWF1024P5WB', name: 'Máy giặt Electrolux Inverter 10 kg cửa trước', price: 11990000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400', minStockLevel: 5, location: 'B08', quantity: 40 },
        { sku: 'LGG-FV1411D4W', name: 'Máy giặt sấy LG AI DD 11 kg / sấy 7 kg', price: 15990000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=400', minStockLevel: 5, location: 'B08', quantity: 32 },
        { sku: 'SAM-DV90T7240BH', name: 'Máy sấy quần áo Bơm nhiệt Samsung Heatpump 9 kg', price: 16490000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400', minStockLevel: 5, location: 'B08', quantity: 22 },
        { sku: 'DAI-FTKF35XVMV', name: 'Điều hòa Daikin Inverter 1.5 HP FTKF35XVMV', price: 13490000, category: 'Máy giặt & Gia dụng lớn', unit: 'Bộ', imageUrl: 'https://images.unsplash.com/photo-1631545856291-a1e64032c2a0?w=400', minStockLevel: 10, location: 'B07', quantity: 60 },
        { sku: 'PAN-CU-CS-XU9ZKH', name: 'Điều hòa Panasonic Inverter 1 HP Nanoe-X', price: 12890000, category: 'Máy giặt & Gia dụng lớn', unit: 'Bộ', imageUrl: 'https://images.unsplash.com/photo-1631545856291-a1e64032c2a0?w=400', minStockLevel: 10, location: 'B07', quantity: 55 },
        { sku: 'ROB-S8-MAXV', name: 'Robot lau nhà tự động Roborock S8 MaxV Ultra', price: 29990000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400', minStockLevel: 5, location: 'B04', quantity: 28 },
        { sku: 'DYS-V15-DETECT', name: 'Máy hút bụi không dây Dyson V15 Detect Absolute', price: 19990000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400', minStockLevel: 5, location: 'B04', quantity: 24 },
        { sku: 'BOS-SMS6ZCI49E', name: 'Máy rửa bát âm tủ Bosch Series 6 SMS6ZCI49E', price: 26990000, category: 'Máy giặt & Gia dụng lớn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400', minStockLevel: 5, location: 'B03', quantity: 18 },

        // 6. Phụ kiện & Thiết bị đeo (ACCESSORIES_WEARABLE) -> Dãy C
        { sku: 'APP-AIRPODS-MAX', name: 'Tai nghe Bluetooth Apple AirPods Max', price: 13190000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400', minStockLevel: 10, location: 'C01', quantity: 70 },
        { sku: 'LOG-MX-KEYS-S', name: 'Bàn phím cơ không dây Logitech MX Keys S', price: 3290000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400', minStockLevel: 15, location: 'C01', quantity: 120 },
        { sku: 'RAZ-DEATHADDER-V3', name: 'Chuột Gaming không dây Razer DeathAdder V3 Pro', price: 3690000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400', minStockLevel: 15, location: 'C01', quantity: 110 },
        { sku: 'APP-WATCH-U2', name: 'Đồng hồ thông minh Apple Watch Ultra 2 GPS + Cellular', price: 21490000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400', minStockLevel: 10, location: 'C02', quantity: 45 },
        { sku: 'GAR-FENIX7X-PRO', name: 'Đồng hồ Garmin Fenix 7X Pro Sapphire Solar', price: 23990000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400', minStockLevel: 8, location: 'C02', quantity: 30 },
        { sku: 'SAM-T7-SHIELD-2TB', name: 'Ổ cứng di động SSD Samsung T7 Shield 2TB', price: 4890000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400', minStockLevel: 15, location: 'C03', quantity: 150 },
        { sku: 'ANK-PRIME-200W', name: 'Sạc dự phòng Anker Prime 20.000mAh 200W', price: 3490000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1609592424109-dd9892f1b177?w=400', minStockLevel: 20, location: 'C03', quantity: 180 },
        { sku: 'HYP-NEXT-10IN1', name: 'Hub chuyển đổi HyperDrive NEXT 10-in-1 USB-C', price: 2890000, category: 'Phụ kiện & Thiết bị đeo', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1616440342855-b4618e47f7d7?w=400', minStockLevel: 20, location: 'C04', quantity: 200 },

        // 7. Linh kiện & Bán dẫn (COMPONENTS_ESD) -> Dãy D
        { sku: 'INT-I9-14900K', name: 'Vi xử lý Intel Core i9-14900K 24 nhân 32 luồng', price: 14990000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=400', minStockLevel: 10, location: 'D01', quantity: 65 },
        { sku: 'AMD-R9-7950X3D', name: 'Vi xử lý AMD Ryzen 9 7950X3D 16 nhân 32 luồng', price: 16490000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=400', minStockLevel: 10, location: 'D01', quantity: 50 },
        { sku: 'ASU-Z790-HERO', name: 'Bo mạch chủ ASUS ROG MAXIMUS Z790 HERO', price: 18990000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400', minStockLevel: 8, location: 'D02', quantity: 40 },
        { sku: 'MSI-RTX4090-SUP', name: 'Card màn hình MSI GeForce RTX 4090 SUPRIM X 24G', price: 56990000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400', minStockLevel: 5, location: 'D02', quantity: 25 },
        { sku: 'COR-DDR5-64GB', name: 'Bộ nhớ RAM Corsair Vengeance RGB DDR5 64GB (2x32GB)', price: 6290000, category: 'Linh kiện & Bán dẫn', unit: 'Bộ', imageUrl: 'https://images.unsplash.com/photo-1562976540-1502c2145186?w=400', minStockLevel: 15, location: 'D01', quantity: 90 },
        { sku: 'SAM-990PRO-2TB', name: 'Ổ cứng SSD M.2 NVMe Samsung 990 PRO 2TB', price: 5490000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=400', minStockLevel: 20, location: 'D01', quantity: 130 },
        { sku: 'COR-RM1000X', name: 'Nguồn máy tính Corsair RM1000x 1000W 80 Plus Gold', price: 4690000, category: 'Linh kiện & Bán dẫn', unit: 'Chiếc', imageUrl: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400', minStockLevel: 10, location: 'D02', quantity: 75 }
      ];

      for (const item of sampleProducts) {
        const { quantity, location, ...prodData } = item;
        const existing = await this.productRepository.findOne({ where: { sku: prodData.sku } });
        
        let savedProd: Product | null = null;
        if (existing) {
          await this.productRepository.update(existing.id, prodData);
          savedProd = await this.productRepository.findOne({ where: { id: existing.id } });
        } else {
          savedProd = await this.productRepository.save(this.productRepository.create(prodData));
        }

        // Link stock to location
        if (savedProd) {
          let inv = await this.inventoryRepository.findOne({ where: { productId: savedProd.id } });
          if (!inv) {
            inv = this.inventoryRepository.create({
              productId: savedProd.id,
              location: location || 'A01',
              currentQuantity: quantity,
              reservedQuantity: 0,
              createdBy: 'seed',
              updatedBy: 'seed',
            });
          } else {
            inv.location = location || inv.location;
            inv.currentQuantity = quantity;
          }
          await this.inventoryRepository.save(inv);
        }
      }

      this.logger.log('Successfully seeded 50 Electronics Megastore products into PostgreSQL DB.');
    } catch (err: any) {
      this.logger.warn(`Failed to seed 50 products: ${err.message}`);
    }
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const { quantity, ...productData } = createProductDto;
      const product = this.productRepository.create(productData);
      const savedProduct = await this.productRepository.save(product);

      // Create initial stock in inventories table
      const initialQuantity = quantity ? Number(quantity) : 0;
      const inventory = this.inventoryRepository.create({
        productId: savedProduct.id,
        location: 'A01',
        currentQuantity: initialQuantity,
        reservedQuantity: 0,
        createdBy: createProductDto.createdBy || 'system',
        updatedBy: createProductDto.updatedBy || 'system',
      });
      await this.inventoryRepository.save(inventory);

      // Emit stock alert: thiếu hàng (dưới min)
      const minLevel = savedProduct.minStockLevel !== undefined ? savedProduct.minStockLevel : 20;
      if (initialQuantity < minLevel) {
        this.notificationClient.emit('product.stock.changed', {
          productId: savedProduct.id,
          productName: savedProduct.name,
          newStock: initialQuantity,
          threshold: minLevel,
          alertType: 'LOW_STOCK',
        });
      }

      return savedProduct;
    } catch (error) {
      if (error.code === '23505') { // Postgres unique violation code
        throw new RpcException('SKU already exists');
      }
      throw new RpcException(error.message);
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    category: string = '',
    sortBy: string = 'createdAt',
    sortOrder: string = 'DESC'
  ): Promise<{ data: any[], total: number, page: number, limit: number }> {
    const skip = (page - 1) * limit;
    
    // Build query conditions
    const whereConditions: any = {};
    if (category && category !== 'ALL') {
      whereConditions.category = ILike(`%${category}%`);
    }

    let where: any;
    if (search) {
      where = [
        { name: ILike(`%${search}%`), ...whereConditions },
        { sku: ILike(`%${search}%`), ...whereConditions }
      ];
    } else {
      where = whereConditions;
    }
    
    let products: any[];
    let total: number;

    if (sortBy === 'quantity') {
      // Fetch all products matching search to perform correct sorting in memory
      const allProducts = await this.productRepository.find({
        where,
        order: { createdAt: 'DESC' }
      });

      const productsWithQty = await Promise.all(allProducts.map(async (product) => {
        const inventories = await this.inventoryRepository.find({ where: { productId: product.id } });
        const currentQuantity = inventories.reduce((sum, item) => sum + (item.currentQuantity || 0), 0);
        return {
          ...product,
          quantity: currentQuantity
        };
      }));

      const actualSortOrder = sortOrder === 'ASC' ? 1 : -1;
      productsWithQty.sort((a, b) => (a.quantity - b.quantity) * actualSortOrder);

      total = productsWithQty.length;
      products = productsWithQty.slice(skip, skip + limit);
    } else {
      const allowedSortFields = ['createdAt', 'name', 'price', 'sku'];
      const actualSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const actualSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const order = { [actualSortBy]: actualSortOrder };

      const [dbProducts, dbTotal] = await this.productRepository.findAndCount({
        where,
        take: limit,
        skip,
        order
      });

      total = dbTotal;
      products = await Promise.all(dbProducts.map(async (product) => {
        const inventories = await this.inventoryRepository.find({ where: { productId: product.id } });
        const currentQuantity = inventories.reduce((sum, item) => sum + (item.currentQuantity || 0), 0);
        return {
          ...product,
          quantity: currentQuantity
        };
      }));
    }

    return {
      data: products,
      total,
      page,
      limit
    };
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { sku } });
    if (!product) {
      throw new RpcException('Product not found');
    }
    return product;
  }

  async update(sku: string, updateProductDto: UpdateProductDto): Promise<Product> {
    console.log('INVENTORY-SERVICE UPDATE LOG:', { sku, updateProductDto });
    const product = await this.findBySku(sku);
    const { quantity, ...productData } = updateProductDto as any;
    
    // Assign updated values
    Object.assign(product, productData);
    const savedProduct = await this.productRepository.save(product);

    if (quantity !== undefined && quantity !== null) {
      let inventory = await this.inventoryRepository.findOne({ where: { productId: product.id } });
      if (!inventory) {
        inventory = this.inventoryRepository.create({
          productId: product.id,
          location: 'A01',
          currentQuantity: Number(quantity),
          reservedQuantity: 0,
          createdBy: 'system',
          updatedBy: 'system',
        });
      } else {
        inventory.currentQuantity = Number(quantity);
      }
      await this.inventoryRepository.save(inventory);

      // Emit stock alert: thiếu hàng (dưới min)
      const currentQty = Number(quantity);
      const minLevel = savedProduct.minStockLevel !== undefined ? savedProduct.minStockLevel : 20;
      if (currentQty < minLevel) {
        this.notificationClient.emit('product.stock.changed', {
          productId: product.id,
          productName: product.name,
          newStock: currentQty,
          threshold: minLevel,
          alertType: 'LOW_STOCK',
        });
      }
    }
    
    return savedProduct;
  }

  async delete(sku: string): Promise<{ deleted: boolean }> {
    const result = await this.productRepository.delete({ sku });
    if (result.affected === 0) {
      throw new RpcException('Product not found');
    }
    return { deleted: true };
  }
}
