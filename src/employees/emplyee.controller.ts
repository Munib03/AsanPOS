import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  UseGuards,
  Body,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { EmployeeService } from './employee.service';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { VerifyDto } from './dto/verify.dto';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';
import { Employee } from '../database/entites/employee.entity';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
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
  remove(@CurrentUser() user: { id: string }) {
    return this.employeeService.remove(user.id);
  }


  @Put('info')
  updateEmployeeInfo(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.updateEmployeeInfo(user.id, dto);
  }


  @Post('verify-updated-email')
  verifyUpdatedEmail(@Body() dto: VerifyDto) {
    return this.employeeService.verifyUpdatedEmail(dto);
  }


  @Delete('profile-pic')
  deleteEmployeeImage(@CurrentUser() user: Employee) {
    return this.employeeService.deleteEmployeeImage(user.id);
  }
}
