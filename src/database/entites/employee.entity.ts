import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OnLoad,
  Filter,
} from '@mikro-orm/core';
import { Store } from './store.entity';
import { v4 as uuidv4 } from 'uuid';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';
import { getSignedUrl } from '../../shared/utils/get.sgned.url';

@Filter({
  name: 'notDeleted',
  cond: { deletedAt: null },
  default: true,
})
@Entity({ tableName: 'employees' })
export class Employee {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ unique: true })
  email!: string;

  @Property({ hidden: true })
  password!: string;

  @Property({ nullable: true })
  phone?: string;

  @Property({ nullable: true })
  role?: string;

  @Property()
  firstName!: string;

  @Property()
  lastName!: string;

  @Property({ nullable: true })
  imageUrl?: string | null;

  @Property({ persist: false })
  imageUrlSigned?: string | null;

  @OnLoad()
  async loadImage() {
    if (this.imageUrl) {
      this.imageUrlSigned = await getSignedUrl(this.imageUrl);
    }
  }

  @ManyToOne(() => Store)
  store!: Store;

  @Property({ nullable: true })
  dob?: Date;

  @Property({ type: 'string', nullable: true })
  gender?: EmployeeGender;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;

  @Property({ type: 'datetime', nullable: true })
  deletedAt: Date | null = null;
}
