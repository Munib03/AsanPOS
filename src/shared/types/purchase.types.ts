export interface StockInProductDetail {
  purchasedItemId: string;
  productId: string;
  productName: string;
  quantity: number;
}

export interface StockInDetail {
  stockInId: string;
  sequenceId: string;
  inventoryId: string;
  inventoryName: string;
  inventoryAddress: string;
  status: string;
  createdAt?: Date;
  products: StockInProductDetail[];
}

export interface PurchaseItemType {
  id?: string;
  quantity?: number;
  unitPrice?: number;
  received?: number;
  product: {
    id?: string;
    name?: string;
    price?: number;
  };
}

export interface PurchaseListItem {
  id: string;
  sequenceId?: string;
  status: string;
  customDate?: Date;
  createdAt?: Date;
  customer: {
    id?: string;
    name?: string;
    phone?: string;
    address?: string;
  };
  items: PurchaseItemType[];
  stockIns: StockInDetail[]; 
  totalPrice: number;
}
