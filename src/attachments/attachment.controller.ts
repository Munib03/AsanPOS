import { Controller, Post, Delete, Param, UseGuards, UploadedFiles, UseInterceptors, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { AttachmentService } from './attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';
import { ImagesUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';


@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}


  @Post('upload/single/:entityType')
  @UseInterceptors(ImageUploadInterceptor)
  uploadSingle(
    @UploadedFiles() file: any,
    @Param('entityType') entityType: AttachmentEntityType,
  ) {
    return this.attachmentService.createAttachment(entityType, file);
  }


  @Post('upload/multiple/:entityType')
  @UseInterceptors(ImagesUploadInterceptor)
  uploadMultiple(
    @UploadedFiles() files: any[],
    @Param('entityType') entityType: AttachmentEntityType,
  ) {
    return this.attachmentService.createAttachments(entityType, files);
  }
  
}