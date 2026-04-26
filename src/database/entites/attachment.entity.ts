import { Entity, PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuidv4 } from 'uuid';


@Entity({ tableName: 'attachments' })
export class Attachment {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ nullable: true })
  imageUrl?: string;

  @Property({ persist: false })
  signedUrl?: string;

  @Property({ type: 'uuid', index: true })
  entityId!: string;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}