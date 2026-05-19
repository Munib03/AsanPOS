import { Entity, PrimaryKey, Property, OneToMany, Collection, ManyToOne } from '@mikro-orm/core';
import { Employee } from './employee.entity';
import { v4 as uuidv4 } from 'uuid';
import { Inventory } from './inventory.entity';
import { StoreSettings } from './store-settings.entity';

@Entity({ tableName: 'stores' })
export class Store {

  @PrimaryKey({ type: 'uuid' })
  id: string = uuidv4();

  @Property()
  name!: string;

  @Property({ nullable: true })
  address?: string;

  @OneToMany(() => Employee, employee => employee.store)
  employees = new Collection<Employee>(this);

  @OneToMany(() => Inventory, inventory => inventory.store)
  inventories = new Collection<Inventory>(this);

  @ManyToOne(() => StoreSettings, { fieldName: "store_settings_id", nullable: true })
  storeSettings?: StoreSettings;

  @Property({ defaultRaw: 'now()', nullable: true })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), defaultRaw: 'now()', nullable: true })
  updatedAt?: Date;
}