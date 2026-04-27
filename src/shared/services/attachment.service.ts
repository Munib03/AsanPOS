import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Attachment } from '../../database/entites/attachment.entity';
import { MinioService } from './minio.service';
import { AttachmentEntityType } from '../utils/attachment-entity-type.enum';


@Injectable()
export class AttachmentService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}

  async presignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl(key);
  }

  async createAttachment(entityType: AttachmentEntityType, file: any): Promise<{ id: string }> {
    if (!file)
      throw new BadRequestException('No image file provided');

    const key = await this.minioService.uploadFile(file);
    
    const attachment = this.em.create(Attachment, {
      entityType,
      imageUrl: key,
      entityId: null,
      claimedAt: undefined,
    });
    
    await this.em.persistAndFlush(attachment);

    return { id: attachment.id };
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


  async claimAttachment(id: string, entityId: string, entityType: AttachmentEntityType): Promise<Attachment> {
    const attachment = await this.getAttachment(id, entityType);

    attachment.entityId = entityId;
    attachment.claimedAt = new Date();
    await this.em.flush();

    if (attachment.imageUrl)
      attachment.signedUrl = await this.presignedUrl(attachment.imageUrl);

    return attachment;
  }


  async deleteAttachment(entityId: string, entityType: AttachmentEntityType): Promise<{ message: string }> {
    const attachment = await this.em.findOne(Attachment, { entityId, entityType });

    if (!attachment)
      throw new UnprocessableEntityException('Attachment not found');

    if (attachment.imageUrl)
      await this.minioService.deleteFile(attachment.imageUrl);

    await this.em.removeAndFlush(attachment);

    return { message: 'Attachment deleted successfully' };
  }
  

  async getClaimedAttachment(entityId: string, entityType: AttachmentEntityType): Promise<Attachment> {
    const attachment = await this.em.findOne(Attachment, { entityId, entityType });

    if (!attachment)
      throw new UnprocessableEntityException('Attachment not found');

    if (attachment.imageUrl)
      attachment.signedUrl = await this.presignedUrl(attachment.imageUrl);

    return attachment;
  }
}