import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, UploadedFile, UseInterceptors, Query } from '@nestjs/common';
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

  @Get('search/by-name')
  searchByName(
    @CurrentStore() store: Store,
    @Query('name') name: string,
  ) {
    return this.productService.searchByName(store, name);
  }

  @Get('search/by-category')
  searchByCategory(
    @CurrentStore() store: Store,
    @Query('category') category: string,
  ) {
    return this.productService.searchByCategory(store, category);
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

  @Post('images/upload')
  @UseInterceptors(ImageUploadInterceptor)
  uploadProductImage(@UploadedFile() file: any) {
    return this.productService.uploadProductImage(file);
  }

  @Get('images/check')
  checkProductImage(@Body() body: { id: string }) {
    return this.productService.checkProductImage(body.id);
  }

  @Post('images/claim')
  claimProductImage(@Body() body: { id: string; productId: string }) {
    return this.productService.claimProductImage(body.id, body.productId);
  }

  @Get(':id/images')
  getProductImages(@Param('id') id: string) {
    return this.productService.getProductImages(id);
  }

  @Delete('images/:imageId')
  deleteProductImage(@Param('imageId') imageId: string) {
    return this.productService.deleteProductImage(imageId);
  }
}