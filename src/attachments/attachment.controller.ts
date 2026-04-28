import { Controller, Post, Delete, Get, Param, UploadedFile, UseInterceptors, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { AttachmentService } from '../shared/services/attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}


  // @Post('employee/upload')
  // @UseInterceptors(ImageUploadInterceptor)
  // uploadEmployeeImage(@UploadedFile() file: any) {
  //   return this.attachmentService.createAttachment(AttachmentEntityType.EMPLOYEE, file);
  // }

  // @Post('employee/claim')
  // claimEmployeeAttachment(
  //   @CurrentUser() user: { id: string },
  //   @Body() body: { id: string },
  // ) {
  //   return this.attachmentService.claimAttachment(body.id, user.id, AttachmentEntityType.EMPLOYEE);
  // }



  // Product endpoints
  // @Post('product/upload')
  // @UseInterceptors(ImageUploadInterceptor)
  // uploadProductImage(@UploadedFile() file: any) {
  //   return this.attachmentService.createAttachment(AttachmentEntityType.PRODUCT, file);
  // }

  // @Post('product/claim')
  // claimProductAttachment(@Body() body: { id: string; productId: string }) {
  //   return this.attachmentService.claimAttachment(body.id, body.productId, AttachmentEntityType.PRODUCT);
  // }

  // @Get(':id/image')
  // async getProductImage(@Param('id') id: string) {
  //   return this.attachmentService.getAttachmentByEntity(
  //     id,
  //     AttachmentEntityType.PRODUCT,
  //   );
  // }

  // @Get('product/:productId')
  // getProductImage(@Param('productId') productId: string) {
  //   return this.attachmentService.getClaimedAttachment(productId, AttachmentEntityType.PRODUCT);
  // }
}