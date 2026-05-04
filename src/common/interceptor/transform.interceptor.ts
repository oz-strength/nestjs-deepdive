import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const http = context.switchToHttp();
        const request = http.getRequest();

        if (Array.isArray(data)) {
          return {
            items: data,
            page: request.query['page'] || 1,
            size: request.query['size'] || 20,
          };
        } else {
          return data;
        }
      }),
    );
  }
}
