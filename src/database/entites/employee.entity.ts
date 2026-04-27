import { Entity, PrimaryKey, Property, ManyToOne, OnLoad } from '@mikro-orm/core';
import { Store } from './store.entity';
import { v4 as uuidv4 } from 'uuid';
import { EmployeeGender } from '../../shared/utils/employeeGenderEnum';
import { MinioService } from '../../shared/services/minio.service';


@Entity({ tableName: 'employees' })
export class Employee {

  constructor(
    private minioService: MinioService
  ) {}

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property({ unique: true })
  email!: string;

  @Property()
  name!: string;

  @Property()
  password!: string;

  @Property({ nullable: true })
  phone?: string;

  @Property({ nullable: true })
  role?: string;

  @Property({ nullable: true })
  firstName?: string;

  @Property({ nullable: true })
  lastName?: string;

  // @OnLoad()           
  // async loadPresignedUrl(){
  //   if(this.imageUrl){
  //     this.imageUrl = await this.minioService.getSignedUrl(this.imageUrl)
  //   }
  // }

  @Property({ nullable: true })
  imageUrl?: string;

  @Property({ nullable: true })
  dob?: Date;

  @Property({ type: 'string', nullable: true })
  gender?: EmployeeGender;

  @Property({ nullable: true })
  verifiedAt?: Date;

  @ManyToOne(() => Store)
  store!: Store;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;

}