import { NotFoundException } from '@nestjs/common';
import {
  EntityManager,
  EntityName,
  EntityRepository,
  FilterQuery,
  FindOneOrFailOptions,
  FindOptions,
  Loaded,
} from '@mikro-orm/core';
import { Meta, PaginateQuery } from '../types/paginate-query.types';
import {
  sanitizeFilterQuery,
  mergeFilterOperators,
  unFlattenObject,
  sanitizeSortObject,
  mergeSortObjects,
  transformFilterQueryParams,
} from '../utils/pagination';

type NotFoundErrorFactory<Entity extends object> = (context: {
  id: string;
  entityName: string;
  where: FilterQuery<Entity>;
}) => Error;

export type Filterable<Entity> = Partial<Record<keyof Entity, any>>;
export type Sortable<Entity> = (keyof Entity & string)[];
export type Searchable<Entity> = (keyof Entity & string | string)[];

export type FilterOptions<Entity> = {
  filterable?: Filterable<Entity>;
  searchable?: Searchable<Entity>;
  sortable?: Sortable<Entity>;
};

function buildNestedCondition(path: string, operator: any) {
  const parts = path.split('.');
  return parts.reverse().reduce((acc, part) => ({ [part]: acc }), operator);
}

export class BaseRepository<Entity extends object> extends EntityRepository<Entity> {
  constructor(em: EntityManager, entityName: EntityName<Entity>) {
    super(em, entityName);
  }

  async findOneOrFail<Hint extends string = never, Fields extends string = '*', Excludes extends string = never>(
    where: FilterQuery<Entity>,
    options?: FindOneOrFailOptions<Entity, Hint, Fields, Excludes> & {
      notFoundError?: Error | NotFoundErrorFactory<Entity>;
      notFoundMessage?: string;
    },
  ): Promise<Loaded<Entity, Hint, Fields, Excludes>> {
    const { failHandler, notFoundError, notFoundMessage, ...findOptions } = options ?? {};

    if (failHandler) {
      return super.findOneOrFail(where, { ...findOptions, failHandler });
    }

    const fallback = (entityName: string, criteria: unknown) => {
      if (typeof notFoundError === 'function') {
        const value =
          typeof criteria === 'object' && criteria !== null && 'id' in criteria
            ? (criteria as Record<string, unknown>).id
            : criteria;

        return notFoundError({
          id: value == null ? '' : String(value),
          entityName,
          where: criteria as FilterQuery<Entity>,
        });
      }

      if (notFoundError) return notFoundError;

      const readableName = entityName.replace(/([a-z])([A-Z])/g, '$1 $2');
      return new NotFoundException(notFoundMessage ?? `${readableName} not found`);
    };

    return super.findOneOrFail(where, {
      ...findOptions,
      failHandler: fallback,
    });
  }

  async findAndPaginate<Hint extends string = never, Fields extends string = '*', Excludes extends string = never>(
    where: FilterQuery<Entity>,
    options?: Omit<FindOptions<Entity, Hint, Fields, Excludes>, 'offset' | 'limit'>,
    filterOptions?: FilterOptions<Entity>,
    query?: PaginateQuery,
  ): Promise<[Loaded<Entity, Hint, Fields, Excludes>[], Meta]> {
    const { page = 1, itemsPerPage = 20, search, filter = {}, sort = {} } = query || {};

    const currentPage = Math.max(1, Number(page));
    const limit = Math.min(Math.max(1, Number(itemsPerPage)), 100);
    const offset = (currentPage - 1) * limit;

    const transformedFilters = transformFilterQueryParams(filter);
    const sanitizedFilters = sanitizeFilterQuery(
      filterOptions?.filterable ?? {},
      transformedFilters,
    );

    let finalWhere: Record<string, any> = mergeFilterOperators(
      where as Record<string, any>,
      sanitizedFilters,
    );

    if (filterOptions?.searchable?.length && search) {
      const directFields: string[] = [];
      const relationFields: string[] = [];

      for (const field of filterOptions.searchable) {
        if ((field as string).includes('.')) {
          relationFields.push(field as string);
        } else {
          directFields.push(field as string);
        }
      }

      const searchConditions = [
        ...directFields.map((field) => ({ [field]: { $ilike: `%${search}%` } })),
        ...relationFields.map((field) => buildNestedCondition(field, { $ilike: `%${search}%` })),
      ];

      if (searchConditions.length > 0) {
        finalWhere.$or = [
          ...(Array.isArray(finalWhere.$or) ? finalWhere.$or : []),
          ...searchConditions,
        ];
      }
    }

    const sortQuery = unFlattenObject(sort);
    const sanitizedSort = sanitizeSortObject(
      sortQuery,
      filterOptions?.sortable ?? [],
    );
    const mergedSort = mergeSortObjects(
      (options?.orderBy as Record<string, any>) ?? {},
      sanitizedSort,
    );

    const [data, count] = await this.findAndCount(
      finalWhere as FilterQuery<Entity>,
      {
        ...options,
        ...(Object.keys(mergedSort).length > 0 ? { orderBy: mergedSort as FindOptions<Entity>['orderBy'] } : {}),
        offset,
        limit,
      },
    );

    const meta: Meta = {
      currentPage,
      itemsPerPage: limit,
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      search,
      filters: sanitizedFilters,
      sorts: sanitizedSort,
    };

    return [data, meta];
  }
}