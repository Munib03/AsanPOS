import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { v4 as uuidv4 } from 'uuid';
import { Category } from "./category.entity";



@Entity({ tableName: "products" })
export class Product {

    @PrimaryKey({ type: "uuid" })
    id: string = uuidv4()

    @Property()
    name!: string;

    @ManyToOne(() => Category, { nullable: true})
    category?: Category;

    @Property({ defaultRaw: "now()", nullable: true})
    createdAt?: Date;

    @Property({ onUpdate: () => new Date(), defaultRaw: "now()", nullable: true })
    updatedAt?: Date;
}