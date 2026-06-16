export interface DashboardStats {
  todaySales: {
    total: number;
    percentageChange: number;
  };
  todayProfit: {
    total: number;
    percentageChange: number;
  };
  lowStockProducts: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];

  outOfStockProducts: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    inventoryName: string;
  }[];
}