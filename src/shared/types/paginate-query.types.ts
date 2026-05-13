export type PaginateQuery = {
  page?: number;
  itemsPerPage?: number;
  search?: string;
  filter?: Record<string, string | string[]>;
  sort?: Record<string, 'asc' | 'desc'>;
};

export type Meta = {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
  totalCount: number;
  search?: string;
  filters?: Record<string, string | string[]>;
  sorts?: Record<string, 'asc' | 'desc'>;
};