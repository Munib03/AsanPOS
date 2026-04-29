import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.productService.findAll(store);
  }

  @Get(':id')
  findOne(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.productService.findOne(store, id);
  }


  @Post()
  create(
    @CurrentStore() store: Store,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(store, dto);
  }


  @Put(':id')
  update(
    @CurrentStore() store: Store,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(store, id, dto);
  }


  @Delete(':id')
  remove(
    @CurrentStore() store: Store,
    @Param('id') id: string,
  ) {
    return this.productService.remove(store, id);
  }


  // Upload image for a product
  @Post(':id/images')
  @UseInterceptors(ImageUploadInterceptor)
  uploadProductImage(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.productService.uploadProductImage(id, file);
  }


  // Get all images for a product
  @Get(':id/images')
  getProductImages(@Param('id') id: string) {
    return this.productService.getProductImages(id);
  }

  
  // Delete a specific product image
  @Delete(':id/images/:imageId')
  deleteProductImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productService.deleteProductImage(id, imageId);
  }
}