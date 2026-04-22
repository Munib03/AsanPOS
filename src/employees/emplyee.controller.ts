import { Controller, Get, Put, Delete, Param, UseGuards, UploadedFile, UseInterceptors, Body, Post } from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { EmployeeService } from './employee.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { MinioService } from '../shared/services/minio.service';
import { VerifyDto } from './dto/verify.dto';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';



@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  findAll() {
    return this.employeeService.findAll();
  }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }


  @Delete()
  remove(@CurrentUser() user: { id: string; }) {
    return this.employeeService.remove( user.id );
  }


  @Put('info')
  @UseInterceptors(ImageUploadInterceptor)
  async updateEmployeeInfo(
    @CurrentUser() user: { id: string; },
    @Body() dto: UpdateEmployeeDto,
    @UploadedFile() file: any,
  ) {
    let imageUrl: string | undefined;

    if (file)
      imageUrl = await this.minioService.uploadFile(file);

    return this.employeeService.updateEmployeeInfo(user.id, dto, imageUrl);
  }


  @Post('verify-updated-email')
  verifyUpdatedEmail(@Body() dto: VerifyDto) {
    return this.employeeService.verifyUpdatedEmail(dto);
  }
}