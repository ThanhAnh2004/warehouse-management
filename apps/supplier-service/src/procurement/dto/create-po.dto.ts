export class CreatePOItemDto {
  productId: string;
  sku: string;
  productName: string;
  requestedQuantity: number;
  unitPrice: number;
}

export class CreatePODto {
  supplierId: string;
  supplierName?: string;
  expectedDeliveryDays?: number;
  notes?: string;
  triggerSource?: 'MANUAL' | 'AI_AUTO_SUGGESTION';
  items: CreatePOItemDto[];
}

export class CreateSupplierDto {
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
}
