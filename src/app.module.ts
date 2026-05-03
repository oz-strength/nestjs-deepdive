import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import emailConfig from './config/email.config';
import jwtConfig from './config/jwt.config';
import postgresConfig from './config/postgres.config';
import sentryConfig from './config/sentry.config';
import swaggerConfig from './config/swagger.config';
import { PrettyLogger } from './config/typeorm-logger';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { UserModule } from './user/user.module';
import { VideoModule } from './video/video.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [postgresConfig, jwtConfig, swaggerConfig, sentryConfig, emailConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        let obj: TypeOrmModuleOptions = {
          type: 'postgres',
          host: configService.get('postgres.host'),
          port: configService.get<number>('postgres.port'),
          database: configService.get('postgres.database'),
          username: configService.get('postgres.username'),
          password: configService.get('postgres.password'),
          autoLoadEntities: true,
          synchronize: false,
        };
        // 주의! 개발 환경에서는 synchronize와 logging을 활성화하여 편리하게 개발할 수 있도록 설정
        if (configService.get('STAGE') === 'local') {
          obj = Object.assign(obj, {
            // synchronize: true,
            logger: new PrettyLogger(),
          });
        }
        return obj;
      },
    }),
    AuthModule,
    UserModule,
    VideoModule,
    AnalyticsModule,
    HealthModule,
    EmailModule,
  ],
  providers: [Logger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
