import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Attachment } from '../database/entites/attachment.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';


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

  async createAttachments(entityType: AttachmentEntityType, files: any[]): Promise<{ ids: string[] }> {
    if (!Object.values(AttachmentEntityType).includes(entityType))
      throw new BadRequestException(`Invalid entityType. Valid values: ${Object.values(AttachmentEntityType).join(', ')}`);

    if (!files?.length)
      throw new BadRequestException('No image files provided');

    const results = await Promise.all(
      files.map(file => this.createAttachment(entityType, file))
    );

    return { ids: results.map(r => r.id) };
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


  async claimAttachments(ids: string[], entityId: string, entityType: AttachmentEntityType): Promise<void> {
    console.log('claiming ids:', ids);
    console.log('entityType:', entityType);
    
    const attachments = await this.getAttachments(ids, entityType);
    console.log('found attachments:', attachments.length);
    
    const now = new Date();
    attachments.map((attachment) => {
      attachment.entityId = entityId;
      attachment.claimedAt = now;
    });

    await this.em.persistAndFlush(attachments);
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


  async getAttachments(ids: string[], entityType: AttachmentEntityType): Promise<Attachment[]> {
    const attachments = await this.em.findAll(Attachment, {
      where: {
        id: { $in: ids },
        entityType,
        claimedAt: null,
      },
    });

    if (attachments.length !== ids.length)
      throw new UnprocessableEntityException('One or more attachments not found or already claimed');

    return attachments;
  }
  

  async presignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl(key);
  }
}