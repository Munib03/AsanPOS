import { Injectable, ExecutionContext, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EntityManager } from '@mikro-orm/postgresql';
import { Employee } from '../../database/entites/employee.entity';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context) as boolean;
    if (!result) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const employee = await this.em.findOne(Employee, { id: user.id }, { populate: ['store'] });
    if (!employee)
      throw new NotFoundException('Employee not found');

    request.store = employee.store;
    return true;
  }
}