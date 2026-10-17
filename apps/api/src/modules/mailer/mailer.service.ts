import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

export interface SendMailOptions {
  from?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST);
  }

  getDefaultFrom(fallback = "security@solar-platform.invalid"): string {
    return process.env.SMTP_FROM || process.env.SMTP_USER || fallback;
  }

  createTransport(): any | null {
    if (!this.isConfigured()) return null;
    const port = Number(process.env.SMTP_PORT || 587);
    const host = process.env.SMTP_HOST;
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? "";

    return nodemailer.createTransport({
      host,
      port,
      secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      ...(user ? { auth: { user, pass } } : {}),
    });
  }

  async sendMail(options: SendMailOptions): Promise<{ accepted: string[]; rejected: string[] }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Email delivery is not configured");
    }

    const transport = this.createTransport();
    if (!transport) {
      throw new ServiceUnavailableException("Email delivery transport unavailable");
    }

    try {
      const from = options.from || this.getDefaultFrom();
      const result = await transport.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        messageId: options.messageId,
        attachments: options.attachments,
      });

      const accepted = (result.accepted || []).map((addr: string) => String(addr).toLowerCase());
      const rejected = (result.rejected || []).map((addr: string) => String(addr).toLowerCase());

      return { accepted, rejected };
    } catch (err: unknown) {
      this.logger.error(`SMTP delivery failed to ${options.to}: ${(err as Error)?.message}`);
      throw err;
    } finally {
      try {
        transport.close();
      } catch {
        // Safe disposal of connection
      }
    }
  }
}
