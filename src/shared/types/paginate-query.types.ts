export type PaginateQuery = {
  page?: number;
  itemsPerPage?: number;
  search?: string;
};

export type Meta = {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
  search?: string;
};