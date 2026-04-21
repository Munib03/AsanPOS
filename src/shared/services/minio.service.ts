import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string = process.env.MINIO_BUCKET ?? 'asan-pos';
  private endpoint: string = process.env.MINIO_ENDPOINT ?? 'localhost';
  private port: number = Number(process.env.MINIO_PORT) ?? 9000;
  private useSSL: boolean = process.env.MINIO_USE_SSL === 'true';
  private protocol: string = this.useSSL ? 'https' : 'http';

  constructor() {
    this.client = new Minio.Client({
      endPoint: this.endpoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists)
      await this.client.makeBucket(this.bucket);

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    };

    await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
  }

  async uploadFile(file: any): Promise<string> {
    const fileName = `${Date.now()}-${file.originalname}`;
    const stream = Readable.from(file.buffer);

    await this.client.putObject(
      this.bucket,
      fileName,
      stream,
      file.size,
      { 'Content-Type': file.mimetype },
    );

    return `${this.protocol}://${this.endpoint}:${this.port}/${this.bucket}/${fileName}`;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const fileName = fileUrl.split('/').pop();
    if (fileName)
      await this.client.removeObject(this.bucket, fileName);
  }
}