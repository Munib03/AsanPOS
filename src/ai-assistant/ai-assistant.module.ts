import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AttachmentModule } from '../attachments/attachment.module';
import { AuditModule } from '../audit/audit.module';
import { SequenceModule } from '../sequence/sequence.module';

@Module({
  imports: [DashboardModule, AttachmentModule, AuditModule, SequenceModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
