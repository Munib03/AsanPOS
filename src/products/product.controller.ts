import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { AttachmentService } from '../shared/services/attachment.service';


@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly attachmentService: AttachmentService
) {}

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.productService.findAll(store);
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


  @Post('upload')
  @UseInterceptors(ImageUploadInterceptor)
  uploadProductImage(@UploadedFile() file: any) {
    return this.attachmentService.createAttachment(AttachmentEntityType.PRODUCT, file);
  }


  @Post('claim')
  claimProductAttachment(@Body() body: { id: string; productId: string }) {
    return this.attachmentService.claimAttachment(body.id, body.productId, AttachmentEntityType.PRODUCT);
  } 

}