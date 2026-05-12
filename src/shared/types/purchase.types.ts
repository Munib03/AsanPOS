export interface PurchaseListItem {
  id: string;
  sequenceId?: number;
  status: string;
  customDate?: Date;
  createdAt?: Date;
  customer: { id?: string; name?: string };
  inventory: { id?: string; name?: string };
  items: {
    id?: string;
    quantity?: number;
    unitPrice?: number;
    product: { id?: string; name?: string; price?: number };
  }[];
  totalPrice: number;
}