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


    attachment.entityId = entityId;
    attachment.claimedAt = new Date();
    await this.em.flush();




    // Remove this later for now it is ok
    if (entityType === AttachmentEntityType.EMPLOYEE) {
      const employee = await this.em.findOne(Employee, { id: entityId });
      if (employee) {
        employee.imageUrl = attachment.imageUrl;
        await this.em.flush();
      }
    }
    // -----------------------------------------------------





    if (attachment.imageUrl)
      attachment.signedUrl = await this.presignedUrl(attachment.imageUrl);

    return attachment;
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