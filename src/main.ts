import { Logger, ValidationPipe } from '@nestjs/common';
import { execSync } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerCustomOptions, SwaggerModule } from '@nestjs/swagger';
import { utilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          level: process.env.STAGE === 'prod' ? 'info' : 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            utilities.format.nestLike('NestJS', { prettyPrint: true }),
          ),
        }),
      ],
    }),
  });
  const port = process.env.PORT ?? 3000;

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NestJS project')
    .setDescription('NestJS project API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
  };
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, customOptions);

  // ValidationPipe 전역 적용
  app.useGlobalPipes(
    new ValidationPipe({
      // class-transformer 적용
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await app.listen(port);
      Logger.log(`STAGE: ${process.env.STAGE}`);
      Logger.log(`listening on port ${port}`);
      break;
    } catch (e) {
      if (e.code === 'EADDRINUSE' && attempt < 5) {
        Logger.warn(`Port ${port} in use, killing process and retrying... (${attempt}/5)`);
        execSync(`npx kill-port ${port}`, { stdio: 'ignore' });
        await new Promise((r) => setTimeout(r, 500));
      } else {
        throw e;
      }
    }
  }
}
bootstrap();
