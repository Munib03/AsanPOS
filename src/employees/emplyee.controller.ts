import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Body,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { EmployeeService } from './employee.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { MinioService } from '../shared/services/minio.service';
import { VerifyDto } from './dto/verify.dto';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { use } from 'passport';

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  findAll() {
    return this.employeeService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  remove(@CurrentUser() user: { id: string }) {
    return this.employeeService.remove(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('info')
  async updateEmployeeInfo(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.updateEmployeeInfo(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-updated-email')
  verifyUpdatedEmail(@Body() dto: VerifyDto) {
    return this.employeeService.verifyUpdatedEmail(dto);
  }
}
