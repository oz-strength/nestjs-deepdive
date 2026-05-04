import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { IncomingWebhook } from '@slack/webhook';
import { Request as ExpressRequest } from 'express';
import { catchError, Observable } from 'rxjs';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
    const http = context.switchToHttp();
    const request = http.getRequest<ExpressRequest>();
    const { url } = request;
    return next.handle().pipe(
      catchError((error) => {
        Sentry.captureException(error);
        const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK);
        webhook.send({
          attachments: [
            {
              text: 'NestJS 프로젝트 에러 발생',
              fields: [
                {
                  title: `Error message: ${error.response?.message || error.message}`,
                  value: `URL: ${url}\nStack trace: ${error.stack}`,
                  short: false,
                },
              ],
              ts: Math.floor(performance.now() / 1000).toString(),
            },
          ],
        });
        throw error;
      }),
    );
  }
}
