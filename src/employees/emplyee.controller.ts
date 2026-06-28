import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Employee } from '../database/entites/employee.entity';
import { Store } from '../database/entites/store.entity';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/role.decorator';
import { CurrentStore } from '../shared/decorators/store.decorator';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/role.guard';
import { Role } from '../shared/utils/role.enum';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeService } from './employee.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) { }

  @Post('register')
  registerEmployee(
    @CurrentStore() store: Store,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeeService.employeeRegister(
      { ...dto, storeName: store.name },
      store,
      user.id,
    );
  }

  @Get()
  findAll(@CurrentStore() store: Store) {
    return this.employeeService.findAll(store);
  }


  @Get('me')
  getMe(@CurrentStore() store: Store, @CurrentUser() user: { id: string; email: string }) {
    return this.employeeService.findOne(store, user.id);
  }

  
  @Put('info')
  updateEmployeeInfo(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateEmployeeDto,
  ) {
    const targetId = dto.id ?? user.id;
    return this.employeeService.updateEmployeeInfo(targetId, user.id, dto);
  }

  @Delete('profile-pic')
  deleteEmployeeImage(@CurrentUser() user: Employee) {
    return this.employeeService.deleteEmployeeImage(user.id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.employeeService.remove(id, user.id);
  }
}