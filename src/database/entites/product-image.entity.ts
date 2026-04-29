import { Entity, PrimaryKey, Property, ManyToOne, OnLoad } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { Product } from './product.entity';
import { getNiceSignedUrl } from '../../shared/utils/get.sgned.url';


@Entity({ tableName: 'product_image' })
export class ProductImage {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @ManyToOne(() => Product)
  product!: Product;

  @Property({ nullable: true, fieldName: 'image_url' })
  imageUrl?: string;

  @Property({ persist: false })
  imageUrlSigned?: string;

  @OnLoad()
  async loadImage() {
    if (this.imageUrl)
      this.imageUrlSigned = await getNiceSignedUrl(this.imageUrl);
  }

  @Property({ defaultRaw: 'now()', nullable: true, fieldName: 'created_at' })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true, fieldName: 'updated_at' })
  updatedAt?: Date;
}