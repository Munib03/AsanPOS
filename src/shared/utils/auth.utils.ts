import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import * as jwt from 'jsonwebtoken';

export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendEmail(to: string, code: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${code}. It expires in 5 minutes.`,
  });
}

export function generateJWT(payload: { sub: string; email: string }): string {
  return jwt.sign(payload, process.env.JWT_SECRET ?? '', { expiresIn: '1d' });
}