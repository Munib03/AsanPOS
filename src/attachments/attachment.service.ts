import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Attachment } from '../database/entites/attachment.entity';
import { MinioService } from '../shared/services/minio.service';
import { AttachmentEntityType } from '../shared/utils/attachment-entity-type.enum';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

const IMAGE_ATTACHMENT_TYPES = [
  AttachmentEntityType.EMPLOYEE,
  AttachmentEntityType.PRODUCT,
] as const;

@Injectable()
export class AttachmentService {
  constructor(
    private readonly em: EntityManager,
    private readonly minioService: MinioService,
  ) {}

  async createAttachment(
    entityType: AttachmentEntityType,
    file: MulterFile,
  ): Promise<{ id: string }> {
    if (!file) throw new BadRequestException('No file provided');
    if (
      !IMAGE_ATTACHMENT_TYPES.includes(
        entityType as
          | AttachmentEntityType.EMPLOYEE
          | AttachmentEntityType.PRODUCT,
      )
    )
      throw new BadRequestException('This attachment type cannot be uploaded');

    const key = await this.minioService.uploadFile(file);

    const attachment = this.em.create(Attachment, {
      entityType,
      fileUrl: key,
      fileName: file.originalname,
      mimeType: null,
      entityId: null,
      claimedAt: null,
    });

    await this.em.persistAndFlush(attachment);

    return { id: attachment.id };
  }

  async createGeneratedDocument(
    entityId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<Attachment> {
    const key = await this.minioService.uploadBuffer(
      buffer,
      fileName,
      mimeType,
    );
    const attachment = this.em.create(Attachment, {
      entityType: AttachmentEntityType.AI_CHAT_MESSAGE,
      entityId,
      fileUrl: key,
      fileName,
      mimeType,
      claimedAt: new Date(),
    });

    await this.em.persistAndFlush(attachment);
    attachment.signedUrl = await this.presignedUrl(attachment.fileUrl);
    return attachment;
  }

  async createAttachments(
    entityType: AttachmentEntityType,
    files: MulterFile[],
  ): Promise<{ ids: string[] }> {
    if (!Object.values(AttachmentEntityType).includes(entityType))
      throw new BadRequestException(
        `Invalid entityType. Valid values: ${Object.values(AttachmentEntityType).join(', ')}`,
      );

    if (!files?.length) throw new BadRequestException('No files provided');

    const results = await Promise.all(
      files.map((file) => this.createAttachment(entityType, file)),
    );

    return { ids: results.map((r) => r.id) };
  }

  async claimAttachment(
    id: string,
    entityId: string,
    entityType: AttachmentEntityType,
  ): Promise<Attachment> {
    const attachment = await this.getAttachment(id, entityType);

    attachment.entityId = entityId;
    attachment.claimedAt = new Date();
    await this.em.flush();

    attachment.signedUrl = await this.presignedUrl(attachment.fileUrl);

    return attachment;
  }

  async claimAttachments(
    ids: string[],
    entityId: string,
    entityType: AttachmentEntityType,
  ): Promise<void> {
    const attachments = await this.getAttachments(ids, entityType);
    const now = new Date();

    attachments.forEach((attachment) => {
      attachment.entityId = entityId;
      attachment.claimedAt = now;
    });

    await this.em.persistAndFlush(attachments);
  }

  async getAttachment(
    id: string,
    entityType: AttachmentEntityType,
  ): Promise<Attachment> {
    const attachment = await this.em.findOne(Attachment, {
      id,
      entityType,
      claimedAt: null,
    });

    if (!attachment)
      throw new UnprocessableEntityException(
        'Attachment not found or already claimed',
      );

    return attachment;
  }

  async getAttachments(
    ids: string[],
    entityType: AttachmentEntityType,
  ): Promise<Attachment[]> {
    const attachments = await this.em.findAll(Attachment, {
      where: {
        id: { $in: ids },
        entityType,
        claimedAt: null,
      },
    });

    if (attachments.length !== ids.length)
      throw new UnprocessableEntityException(
        'One or more attachments not found or already claimed',
      );

    return attachments;
  }

  async deleteAttachmentByFileUrl(
    fileUrl: string,
    entityType: AttachmentEntityType,
  ): Promise<void> {
    const attachment = await this.em.findOne(Attachment, {
      fileUrl,
      entityType,
    });

    if (attachment) await this.em.removeAndFlush(attachment);

    await this.minioService.deleteFile(fileUrl);
  }

  async presignedUrl(key: string): Promise<string> {
    return this.minioService.getSignedUrl(key);
  }
}
