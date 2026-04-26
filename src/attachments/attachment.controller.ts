import { Controller, Post, Delete, Get, Param, UploadedFile, UseInterceptors, UseGuards, Put } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { CurrentUser } from '../shared/decorators/current-user.decorator';


@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}


  @Put("img-update")
  @UseInterceptors(ImageUploadInterceptor)
  uploadImage(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: any,
  ) {
    return this.attachmentService.uploadImage(user.id, file);
  }


  @Delete("img-delete")
  removeImage(@CurrentUser() user: { id: string }) {
    return this.attachmentService.removeImage(user.id);
  }
}