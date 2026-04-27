import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';
import { AttachmentEntityType } from '../../shared/utils/attachment-entity-type.enum';

@Entity({ tableName: 'attachments' })
export class Attachment {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ nullable: true })
  imageUrl?: string;

  @Property({ type: 'uuid', nullable: true })
  entityId?: string;

  @Property({ type: 'string', nullable: false })
  entityType!: AttachmentEntityType;

  @Property({ nullable: true, fieldName: "claimed_at" })
  claimedAt?: Date;
  
  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;
  
  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
  
  @Property({ persist: false })
  signedUrl?: string;
}