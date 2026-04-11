import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { Employee } from './Employee';

@Entity()
export class TwoFactorAuth {

    @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
    id!: string;

    @ManyToOne(() => Employee)
    user!: Employee;

    @Property()
    code!: string;

    @Property()
    expiresAt!: Date;

    @Property({ nullable: true })
    usedAt?: Date;

    @Property({ defaultRaw: 'now()' })
    createdAt: Date = new Date();
}