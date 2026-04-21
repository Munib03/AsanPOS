import { Collection, Entity, OneToMany, PrimaryKey, Property } from "@mikro-orm/core";
import { v4 as uuidv4 } from 'uuid';
import { Product } from "./product.entity";



@Entity({ tableName: "categories"} )
export class Category {
    
    @PrimaryKey({ type: "uuid" })
    id: string = uuidv4();

    @Property()
    name!: string;

    @OneToMany(() => Product, p => p.category)
    product = new Collection<Product>(this);

    @Property({ defaultRaw: "now()", nullable: true })
    createdAt?: Date;

    @Property({ onUpdate: () => new Date(), defaultRaw: "now()", nullable: true })
    updatedAt?: Date;
}