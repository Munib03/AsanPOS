import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { sendEmail } from '../../shared/utils/auth.utils'; 

@Processor('email')
export class EmailProcessor extends WorkerHost {
    async process(job: Job): Promise<void> {
        switch (job.name) {

            case 'send-verification':
                await sendEmail(job.data.email, job.data.code);
                break;

            case 'send-2fa-setup':
                await sendEmail(job.data.email, job.data.code);
                break;

            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    }
}