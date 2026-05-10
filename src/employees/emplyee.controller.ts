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
  async updateEmployeeInfo(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.updateEmployeeInfo(user.id, dto);
  }


  @Post('verify-updated-email')
  verifyUpdatedEmail(@Body() dto: VerifyDto) {
    return this.employeeService.verifyUpdatedEmail(dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: { id: string; email: string }) {
    return this.employeeService.getMe(user.id);
  }
}
