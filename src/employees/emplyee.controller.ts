import { Controller, Get, Put, Delete, Param, Body, UseGuards, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { MinioService } from '../shared/services/minio.service';
import { EmployeeService } from './employee.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';



@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly minioService: MinioService,
  ) {}

  @UseGuards(JwtAuthGuard)
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
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeeService.remove(id);
  }


  @UseGuards(JwtAuthGuard)
  @Put('me/image')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
        cb(new BadRequestException('Only image files are allowed'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async uploadImage(
    @CurrentUser() user: { id: string; email: string },
    @UploadedFile() file: any,
  ) {
    const imageUrl = await this.minioService.uploadFile(file);
    return this.employeeService.uploadImage(user.id, imageUrl);
  }
}