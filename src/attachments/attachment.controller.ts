import { Controller, Post, Delete, Get, Body, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { AttachmentService } from '../shared/services/attachment.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';


@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post('employee/upload')
  @UseInterceptors(ImageUploadInterceptor)
  uploadEmployeeImage(@UploadedFile() file: any) {
    return this.attachmentService.createAttachment(AttachmentEntityType.EMPLOYEE, file);
  }

  @Get('employee/check')
  checkAttachment(@Body() body: { id: string }) {
    return this.attachmentService.getAttachment(body.id, AttachmentEntityType.EMPLOYEE);
  }

  @Post('employee/claim')
  claimAttachment(
    @CurrentUser() user: { id: string },
    @Body() body: { id: string },
  ) {
    return this.attachmentService.claimAttachment(body.id, user.id, AttachmentEntityType.EMPLOYEE);
  }


  @Delete('employee')
  deleteEmployeeAttachment(@CurrentUser() user: { id: string }) {
    return this.attachmentService.deleteAttachment(user.id, AttachmentEntityType.EMPLOYEE);
  }
}