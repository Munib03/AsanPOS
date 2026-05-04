import { EntityManager } from '@mikro-orm/core';
import { Product } from '../database/entites/product.entity';
import { BaseRepository } from '../shared/repositories/base.repository';

export class ProductRepository extends BaseRepository<Product> {
  constructor(em: EntityManager) {
    super(em, Product);
  }
}