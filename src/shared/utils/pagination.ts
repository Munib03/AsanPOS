export type FilterOperator = {
  $eq?: any;
  $ne?: any;
  $gt?: any;
  $gte?: any;
  $lt?: any;
  $lte?: any;
  $like?: string;
  $ilike?: string;
  $in?: any[];
  $nin?: any[];
};

export function normalizePagination(page?: number, itemsPerPage?: number) {
  const parsedPage = Number(page);
  const parsedItemsPerPage = Number(itemsPerPage);
  const currentPage =
    Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit =
    Number.isInteger(parsedItemsPerPage) && parsedItemsPerPage > 0
      ? Math.min(parsedItemsPerPage, 100)
      : 20;

  return {
    currentPage,
    limit,
    offset: (currentPage - 1) * limit,
  };
}

export async function findAndPaginate<Entity extends object>(
  em: EntityManager,
  entity: EntityName<Entity>,
  where: FilterQuery<Entity>,
  options: Record<string, unknown>,
  query: PaginateQuery = {},
): Promise<{
  data: Entity[];
  meta: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
}> {
  const { currentPage, limit, offset } = normalizePagination(
    query.page,
    query.itemsPerPage,
  );
  const [data, totalItems] = await em.findAndCount(entity, where, {
    ...options,
    limit,
    offset,
  } as never);

  return {
    data: data as Entity[],
    meta: {
      currentPage,
      itemsPerPage: limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export function transformFilterQueryParams(
  filter: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(filter)) {
    result[key] = value;
  }
  return result;
}

export function sanitizeFilterQuery(
  filterable: Record<string, any>,
  filter: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(filter)) {
    if (key in filterable) {
      result[key] = filter[key];
    }
  }
  return result;
}

export function mergeFilterOperators(
  base: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  return { ...base, ...override };
}

export function unFlattenObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

export function sanitizeSortObject(
  sort: Record<string, any>,
  sortable: string[],
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(sort)) {
    if (sortable.includes(key)) {
      result[key] = sort[key];
    }
  }
  return result;
}

export function mergeSortObjects(
  base: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  return { ...base, ...override };
}
import type {
  EntityManager,
  EntityName,
  FilterQuery,
} from '@mikro-orm/postgresql';
import type { PaginateQuery } from '../types/paginate-query.types';
