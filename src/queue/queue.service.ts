import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
    constructor(
        @InjectQueue('email') private readonly emailQueue: Queue,
    ) { }

    // Called during registration — sends OTP email
    async sendVerificationEmail(email: string, code: string) {
        await this.emailQueue.add(
            'send-verification',   // job name
            { email, code },       // job data
            {
                attempts: 3,         // retry 3 times if it fails
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true,
                removeOnFail: false, // keep failed jobs for debugging
            },
        );
    }

    // Called during 2FA setup — not needed for email but scalable for future
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

    // Future: add order processing queue job here
    // async processOrder(orderId: string) {
    //   await this.orderQueue.add('process-order', { orderId }, { attempts: 3 });
    // }
}