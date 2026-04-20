import { Controller, Get, Put, Delete, Param, UseGuards, UploadedFile, UseInterceptors, BadRequestException, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { EmployeeService } from './employee.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { MinioService } from '../shared/services/minio.service';



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


  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeeService.remove(id);
  }


  @UseGuards(JwtAuthGuard)
  @Put('info')
  @UseInterceptors(FileInterceptor('image', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {

      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) 
        cb(new BadRequestException('Only image files are allowed'), false);
      
      else 
        cb(null, true);
      
    },
    
  }))
  async updateEmployeeInfo(
    @CurrentUser() user: { id: string; },
    @Body() dto: UpdateEmployeeDto,
    @UploadedFile() file: any,
  ) {
    let imageUrl: string | undefined;

    if (file) {
      imageUrl = await this.minioService.uploadFile(file);
    }

    return this.employeeService.updateEmployeeInfo(user.id, dto, imageUrl);
  }
}