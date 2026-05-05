import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
    constructor(
        @InjectQueue('email') private readonly emailQueue: Queue,
    ) { }

    async sendVerificationEmail(email: string, code: string) {
        await this.emailQueue.add(
            'send-verification',   
            { email, code },       
            {
                attempts: 3,         
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true,
                removeOnFail: false, 
            },
        );
    }

    async send2FASetupEmail(email: string, code: string) {
        await this.emailQueue.add(
            'send-2fa-setup',
            { email, code },
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true,
                removeOnFail: false,
            },
        );
    }
}