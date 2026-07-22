import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../shared/decorators/role.decorator';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { Role } from '../shared/utils/role.enum';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query, query.type);
  }

  @Get('entity/:entityId')
  findByEntity(
    @Param('entityId') entityId: string,
    @Query() query: PaginateQuery,
  ) {
    return this.auditService.findByEntity(entityId, query);
  }
}
