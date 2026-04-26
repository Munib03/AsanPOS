import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Attachment } from '../database/entites/attachment.entity';
import { MinioService } from '../shared/services/minio.service';
import { Employee } from '../database/entites/employee.entity';


@Injectable()
export class AttachmentService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}


  
  private async generateSignedUrl(attachment: Attachment): Promise<Attachment> {
    if (attachment.imageUrl)
      attachment.signedUrl = await this.minioService.getSignedUrl(attachment.imageUrl);

    return attachment;
  }

  async uploadImage(employeeId: string, file: any): Promise<Attachment> {
    if (!file)
      throw new BadRequestException('No image file provided');

    const key = await this.minioService.uploadFile(file);

    const existing = await this.em.findOne(Attachment, { entityId: employeeId });
    if (existing) {
      if (existing.imageUrl)
        await this.minioService.deleteFile(existing.imageUrl);

      existing.imageUrl = key;
      await this.em.flush();

      await this.updateEmployeeImageUrl(employeeId, key);

      return this.generateSignedUrl(existing);
    }

    const attachment = this.em.create(Attachment, {
      entityId: employeeId,
      imageUrl: key,
    });

    await this.em.persistAndFlush(attachment);

    await this.updateEmployeeImageUrl(employeeId, key);

    return this.generateSignedUrl(attachment);
  }


  async removeImage(employeeId: string): Promise<{ message: string }> {
    const attachment = await this.em.findOne(Attachment, { entityId: employeeId });
    if (!attachment)
      throw new NotFoundException('No image found');

    if (attachment.imageUrl)
      await this.minioService.deleteFile(attachment.imageUrl);

    await this.em.removeAndFlush(attachment);

    await this.updateEmployeeImageUrl(employeeId, null);

    return { message: 'Image deleted successfully' };
  }


  private async updateEmployeeImageUrl(employeeId: string, imageUrl: string | null) {
    const employee = await this.em.findOne(Employee, { id: employeeId });
    if (employee) {
      employee.imageUrl = imageUrl ?? undefined;
      await this.em.flush();
    }
  }
}