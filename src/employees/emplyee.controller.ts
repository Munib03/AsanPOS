import { Controller, Get, Put, Delete, Param, Body, UseGuards, Post } from '@nestjs/common';
import { EmployeeService } from './employee.service';


@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) { }

  //@UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.employeeService.findAll();
  }

  // @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeeService.findOne(id);
  }

  // @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeeService.remove(id);
  }

  @Post('login')
  login(@Body() body: { username: string; password: string }) {
    return this.employeeService.login(body.username, body.password);
  }
}