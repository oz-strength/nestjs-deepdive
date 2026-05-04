import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Video } from 'src/video/entity/video.entity';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async send(videos: Video[]) {
    const data = videos.map(({ id, title, downloadCnt }) => {
      return `<tr><td>${id}</td><td>${title}</td><td>${downloadCnt}</td></tr>`;
    });
    await this.mailerService.sendMail({
      from: this.configService.get('email.from'),
      to: this.configService.get('email.to'),
      subject: 'NestJS project videos',
      html: `<table style="border: 1px solid black; width:60%; margin:auto; text-align:center;">
      <tr><th>ID</th><th>Title</th><th>Download Count</th></tr>
      ${data.join('')}</table>`,
    });
  }
}
