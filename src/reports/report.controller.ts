import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import express from 'express';
import { ReportService } from './report.service';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Roles } from '../shared/decorators/role.decorator';
import { Role } from '../shared/utils/role.enum';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { Store } from '../database/entites/store.entity';
import * as paginateQueryTypes from '../shared/types/paginate-query.types';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class ReportController {
    constructor(private readonly reportService: ReportService) { }

    @Get()
    getReport(
        @CurrentStore() store: Store,
        @Query() reportQuery: ReportQueryDto,
        @Query() query: paginateQueryTypes.PaginateQuery,
    ) {
        return this.reportService.getReport(store, reportQuery, query);
    }

    @Get('export')
    async exportReport(
        @CurrentStore() store: Store,
        @Query() exportQuery: ReportExportQueryDto,
        @Res() res: express.Response,
    ) {
        return this.reportService.exportReport(store, exportQuery, res);
    }
}