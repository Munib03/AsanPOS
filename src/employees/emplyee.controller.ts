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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { CurrentStore } from '../shared/decorators/store.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
  ) {}

  @Post('register')
  registerEmployee(
    @CurrentStore() store: Store,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeeService.employeeRegister({
      ...dto,
      storeName: store.name,
    }, store);
  }


  @Get()
  findAll() {
    return this.employeeService.findAll();
  }

  @Get('me')
  getMe(@CurrentUser() user: { id: string; email: string }) {
    return this.employeeService.findOne(user.id);
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