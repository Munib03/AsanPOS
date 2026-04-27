import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Attachment } from '../../database/entites/attachment.entity';
import { MinioService } from './minio.service';
import { AttachmentEntityType } from '../utils/attachment-entity-type.enum';
import { Employee } from '../../database/entites/employee.entity';

@Injectable()
export class AttachmentService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}

  
  async createAttachment(entityType: AttachmentEntityType, file: any): Promise<{ id: string }> {
    if (!file)
      throw new BadRequestException('No image file provided');

    const key = await this.minioService.uploadFile(file);

    const attachment = this.em.create(Attachment, {
      entityType,
      imageUrl: key,
      entityId: null,
      claimedAt: null,
    });

    await this.em.persistAndFlush(attachment);
    
    return { id: attachment.id };
  }
  
  
  
  async claimAttachment(id: string, entityId: string, entityType: AttachmentEntityType): Promise<Attachment> {
    const attachment = await this.getAttachment(id, entityType);

    const existing = await this.em.findOne(Attachment, {
      entityId,
      entityType,
      claimedAt: { $ne: null },
    });

    if (existing) {
      if (existing.imageUrl)
        await this.minioService.deleteFile(existing.imageUrl);
      await this.em.removeAndFlush(existing);
    }

    attachment.entityId = entityId;
    attachment.claimedAt = new Date();
    await this.em.flush();

    if (entityType === AttachmentEntityType.EMPLOYEE) {
      const employee = await this.em.findOne(Employee, { id: entityId });
      if (employee) {
        employee.imageUrl = attachment.imageUrl;
        await this.em.flush();
      }
    }

    if (attachment.imageUrl)
      attachment.signedUrl = await this.presignedUrl(attachment.imageUrl);

    return attachment;
  }


  async deleteAttachment(entityId: string, entityType: AttachmentEntityType): Promise<{ message: string }> {
    const attachment = await this.em.findOne(Attachment, {
      entityId,
      entityType,
      claimedAt: { $ne: null },
    });

    if (!attachment)
      throw new UnprocessableEntityException('Attachment not found');

    if (attachment.imageUrl)
      await this.minioService.deleteFile(attachment.imageUrl);

    await this.em.removeAndFlush(attachment);
    
    return { message: 'Attachment deleted successfully' };
  }
  

  async getAttachment(id: string, entityType: AttachmentEntityType): Promise<Attachment> {
    const attachment = await this.em.findOne(Attachment, {
      id,
      entityType,
      claimedAt: null,
    });

    if (!attachment)
      throw new UnprocessableEntityException('Attachment not found or already claimed');

    return attachment;
  }

  
  async presignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl(key);
  }
}