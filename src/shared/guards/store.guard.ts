import { Injectable, CanActivate, ExecutionContext, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../../database/entites/employee.entity';

@Injectable()
export class StoreGuard implements CanActivate {
  constructor(private readonly em: EntityManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const employee = await this.em.findOne(Employee, { id: user.id }, { populate: ['store'] });
    if (!employee)
      throw new NotFoundException('Employee not found');

    request.store = employee.store;
    return true;
  }
}
