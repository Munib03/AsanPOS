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
import { VerifyDto } from './dto/verify.dto';
import { ImageUploadInterceptor } from '../shared/interceptors/image-upload.interceptor';

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
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

    
  // @UseGuards(JwtAuthGuard)
  // @Get('me')
  // getMe(@CurrentUser() user: { id: string; email: string }) {
  //   return this.employeeService.getMe(user.id);
  // }
  

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


  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(ImageUploadInterceptor)
  uploadEmployeeImage(@UploadedFile() file: any) {
    return this.employeeService.createEmployeeAttachment(
      file
    );
  }


  @UseGuards(JwtAuthGuard)
  @Get('check')
  checkAttachment(@Body() body: { id: string }) {
    return this.employeeService.getEmployeeAttachment(
      body.id,
    );
  }


  @Post('claim')
  @UseGuards(JwtAuthGuard)
  claimEmployeeAttachment(
    @CurrentUser() user: { id: string },
    @Body() body: { id: string },
  ) {
    return this.employeeService.claimEmployeeAttachment(
      user.id,
      body.id,
    );
  }
}
