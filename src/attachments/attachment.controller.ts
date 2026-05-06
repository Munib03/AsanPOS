import { Controller, Post, Delete, UseGuards, UploadedFile, UploadedFiles, UseInterceptors, Body, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { AttachmentService } from './attachment.service';
import { ImagesUploadInterceptor, ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
    constructor(private readonly attachmentService: AttachmentService) {}


                // This two for single photos (uploading, deleting single photos)

//   @Post('upload/single')
//   @UseInterceptors(ImageUploadInterceptor)
//   uploadSingle(
//     @UploadedFile() file: any,
//     @Body('entityType') entityType: AttachmentEntityType,
//   ) {
//     return this.attachmentService.createAttachment(entityType, file);
//   }


  @Post('upload')
  @UseInterceptors(ImagesUploadInterceptor)
  uploadMultiple(
    @UploadedFiles() files: any[],
    @Body('entityType') entityType: AttachmentEntityType,
  ) {
    return this.attachmentService.createAttachments(entityType, files);
  }
}