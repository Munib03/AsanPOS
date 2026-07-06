import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager, EntityName, serialize } from '@mikro-orm/postgresql';
import { Response } from 'express';
import { format as formatCsv } from 'fast-csv';
import { Store } from '../database/entites/store.entity';
import { ExportFormat, ReportExportQueryDto, ReportQueryDto, ReportType } from './dto/report-query.dto';
import { PaginateQuery } from '../shared/types/paginate-query.types';
import { BaseRepository, FilterOptions } from '../shared/repositories/base.repository';
import { REPORT_CONFIG } from '../shared/utils/report.config';

type ExportColumn = { header: string; key: string };

type ReportConfig = {
    entity: EntityName<any>;
    storeFilter: (store: Store) => Record<string, any>;
    populate: string[];
    fields: string[];
    filterOptions: FilterOptions<any>;
    exportColumns: ExportColumn[];
};

const SENSITIVE_EMPLOYEE_FIELDS = [
    'password', 'imageUrl', 'imageUrlSigned', 'dob', 'gender',
    'verifiedAt', 'createdAt', 'updatedAt', 'deletedAt', 'store',
    'firstName', 'lastName', 'phone',
];

@Injectable()
export class ReportService {
    constructor(private readonly em: EntityManager) { }


    async getReport(store: Store, reportQuery: ReportQueryDto, query: PaginateQuery) {
        const config = this.getConfig(reportQuery.type);
        const dateFilter = this.buildDateFilter(reportQuery.from, reportQuery.to);

        const [data, meta] = await this.repo(config).findAndPaginate(
            { ...config.storeFilter(store), ...dateFilter },
            this.buildFindOptions(config),
            config.filterOptions,
            query,
        );

        return {
            type: reportQuery.type,
            data: this.stripSensitiveFields(serialize(data, { populate: config.populate as never[] })),
            meta,
        };
    }

    async exportReport(store: Store, exportQuery: ReportExportQueryDto, res: Response) {
        const config = this.getConfig(exportQuery.type);
        const dateFilter = this.buildDateFilter(exportQuery.from, exportQuery.to);
        const rows = await this.fetchAll(store, config, dateFilter);
        const filename = `${exportQuery.type}_report_${Date.now()}`;

        const handlers: Record<ExportFormat, () => void> = {
            [ExportFormat.CSV]: () => this.exportCsv(res, rows, config, filename),
            [ExportFormat.JSON]: () => this.exportJson(res, rows, filename),
        };

        const handler = handlers[exportQuery.format];
        if (!handler) throw new BadRequestException(`Unsupported export format: ${exportQuery.format}`);
        handler();
    }



    private exportJson(res: Response, rows: any[], filename: string) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.send(JSON.stringify({ total: rows.length, data: rows }, null, 2));
    }

    private exportCsv(res: Response, rows: any[], config: ReportConfig, filename: string) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

        const stream = formatCsv({ headers: config.exportColumns.map((c) => c.header) });
        stream.pipe(res);

        for (const row of rows) {
            const csvRow: Record<string, any> = {};
            for (const col of config.exportColumns) {
                csvRow[col.header] = this.resolvePath(row, col.key);
            }
            stream.write(csvRow);
        }

        stream.end();
    }


    private getConfig(type: ReportType): ReportConfig {
        const config = REPORT_CONFIG[type];
        if (!config) throw new BadRequestException(`Unsupported report type: ${type}`);
        return config;
    }

    private buildDateFilter(from?: string, to?: string): Record<string, any> {
        if (!from && !to) return {};
        const createdAt: Record<string, Date> = {};
        if (from) createdAt.$gte = new Date(from);
        if (to) createdAt.$lte = new Date(to);
        return { createdAt };
    }

    private resolvePath(obj: any, path: string): any {
        return path.split('.').reduce((acc, key) => {
            if (acc == null) return '';
            if (key === 'length') return Array.isArray(acc) ? acc.length : '';
            return acc[key];
        }, obj) ?? '';
    }

    private repo(config: ReportConfig) {
        return new BaseRepository(this.em, config.entity);
    }

    private buildFindOptions(config: ReportConfig) {
        return {
            populate: config.populate as never[],
            fields: config.fields as never[],
            orderBy: { createdAt: 'DESC' as const },
        };
    }

    private stripSensitiveFields(rows: any[]): any[] {
        return rows.map((row) => {
            const cleaned = { ...row };
            for (const key of Object.keys(cleaned)) {
                const val = cleaned[key];
                if (val && typeof val === 'object' && !Array.isArray(val) && val.password !== undefined) {
                    const cleanedRelation = { ...val };
                    for (const field of SENSITIVE_EMPLOYEE_FIELDS) {
                        delete cleanedRelation[field];
                    }
                    cleaned[key] = cleanedRelation;
                }
            }
            return cleaned;
        });
    }

    private async fetchAll(store: Store, config: ReportConfig, dateFilter: Record<string, any>) {
        const data = await this.repo(config).findAll({
            where: { ...config.storeFilter(store), ...dateFilter },
            ...this.buildFindOptions(config),
        });
        return this.stripSensitiveFields(serialize(data, { populate: config.populate as never[] }));
    }
}