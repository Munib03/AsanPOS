import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AttachmentModule } from '../attachments/attachment.module';

@Module({
  imports: [DashboardModule, AttachmentModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
