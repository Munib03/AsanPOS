export type PaginateQuery = {
  page?: number;
  itemsPerPage?: number;
  search?: string;
  filter?: Record<string, any>;
  sort?: Record<string, any>;
};

export type Meta = {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
  search?: string;
  filters?: Record<string, any>;
  sorts?: Record<string, any>;
};