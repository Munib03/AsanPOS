import { Controller, Delete, Get, UploadedFile, UseInterceptors, UseGuards, Put } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { CurrentUser } from '../shared/decorators/current-user.decorator';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Get()
  getEmployeeImage(@CurrentUser() user: { id: string }) {
    return this.attachmentService.getEmployeeImage(user.id);
  }

  @Put('img')
  @UseInterceptors(ImageUploadInterceptor)
  uploadEmployeeImage(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: any,
  ) {
    return this.attachmentService.uploadEmployeeImage(user.id, file);
  }

  @Delete()
  removeEmployeeImage(@CurrentUser() user: { id: string }) {
    return this.attachmentService.removeEmployeeImage(user.id);
  }
}