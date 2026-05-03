# ND-9: 파일 업로드 / 스트리밍 다운로드 / 태스크 스케줄링 개발 기록

## 메타
- **날짜:** 2026-05-03
- **브랜치:** `feature/ND-9-file-upload-task-schedule`
- **베이스 커밋:** `9dafef0` — Merge pull request #16 ND-8 CQRS
- **PR:** 없음 (진행 중)

---

## 주요 기능
> NestJS에서 파일 업로드/스트리밍 다운로드를 완성하고, Cron 기반 태스크 스케줄러로 다운로드 인기 영상을 주기적으로 이메일 발송

- `POST /api/videos`: Multer 기반 mp4 파일 업로드 (타입 검증 + 5MB 크기 제한)
- `GET /api/videos/:id/download`: `ReadStream` + `StreamableFile`로 메모리 효율적인 스트리밍 다운로드
- `GET /api/videos/:id`: TypeORM relations join으로 단건 조회 완성
- CQRS `CreateVideoHandler`의 파일 저장 stub → `fs/promises.writeFile` 실제 구현
- `VideoService.findTop5Download()`: 다운로드 수 TOP 5 영상 조회
- `@Cron(EVERY_MINUTE)` 스케줄러: 매분 TOP 5 영상 목록을 Gmail SMTP로 이메일 발송
- `EmailModule` / `EmailService`: `@nestjs-modules/mailer` + Gmail SMTP 연동

---

## 사용 기술 스택
`NestJS v11` `TypeScript` `Multer` `@nestjs/schedule` `@nestjs-modules/mailer` `Nodemailer` `TypeORM` `CQRS` `StreamableFile` `fs/promises` `PostgreSQL` `Swagger` `Gmail SMTP`

---

## 구현 방법

### 파일 업로드 파이프라인

`FileInterceptor`와 `ParseFilePipeBuilder`를 체이닝해 선언적으로 검증 규칙을 구성했다.

```typescript
@UseInterceptors(FileInterceptor('video'))
@Post()
async upload(
  @UploadedFile(
    new ParseFilePipeBuilder()
      .addFileTypeValidator({ fileType: 'mp4' })
      .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
      .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
  )
  file: Express.Multer.File,
  @Body() createVideoReqDto: CreateVideoReqDto,
)
```

`file.mimetype`, `file.originalname`, `file.buffer`를 추출해 `CreateVideoCommand`에 담아 CommandBus로 디스패치. 확장자는 `originalname.split('.').pop()`으로 파싱.

### 파일 저장 (CreateVideoHandler)

기존 stub(`console.log`) → 실제 파일 I/O로 교체. DB 트랜잭션과 파일 저장을 동일한 `QueryRunner` 스코프 안에 묶어 원자성 보장.

```typescript
private async uploadVideo(id: string, extension: string, buffer: Buffer) {
  const filePath = join(process.cwd(), 'video-storage', `${id}.${extension}`);
  await writeFile(filePath, buffer);
}
```

파일명 전략: `{videoUUID}.{extension}` — DB의 UUID를 그대로 사용해 조회 시 O(1) 매핑.

### 스트리밍 다운로드 (VideoService)

```typescript
async download(id: string): Promise<{ stream: ReadStream; mimetype: string; size: number }> {
  const video = await this.videoRepository.findOne({ where: { id } });
  if (!video) throw new NotFoundException('Video not found');
  await this.videoRepository.update({ id }, { downloadCnt: () => 'download_cnt + 1' });
  const { mimetype } = video;
  const videoPath = join(process.cwd(), 'video-storage', `${id}.${mimetype.split('/')[1]}`);
  const { size } = await stat(videoPath);
  const stream = createReadStream(videoPath);
  return { stream, mimetype, size };
}
```

컨트롤러에서 `@Res({ passthrough: true })`로 헤더를 직접 설정하고 `new StreamableFile(stream)` 반환.

### Cron 태스크 스케줄러 (AnalyticsService)

`@nestjs/schedule`의 `@Cron` 데코레이터로 주기 실행 작업을 선언적으로 등록.

```typescript
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly videoService: VideoService,
    private readonly emailService: EmailService,
  ) {}

  // @Cron(CronExpression.EVERY_DAY_AT_10AM)  // 프로덕션용
  @Cron(CronExpression.EVERY_MINUTE)           // 개발/테스트용
  async handleEmailCron() {
    Logger.log('Email task called');
    const videos = await this.videoService.findTop5Download();
    await this.emailService.send(videos);
  }
}
```

`ScheduleModule.forRoot()`를 `AnalyticsModule`에 등록해 스케줄러를 애플리케이션에 활성화.

### 이메일 발송 (EmailService)

`@nestjs-modules/mailer`의 `MailerService`를 사용. Gmail SMTP 인증 정보는 `ConfigModule`의 네임스페이스 설정(`email.config.ts`)으로 환경변수에서 주입.

```typescript
async send(videos: Video[]) {
  const data = videos.map(({ id, title, downloadCnt }) =>
    `<tr><td>${id}</td><td>${title}</td><td>${downloadCnt}</td></tr>`
  );
  await this.mailerService.sendMail({
    from: 'ohsw9262@gmail.com',
    to: 'ozstrength93@gmail.com',
    subject: 'NestJS project videos',
    html: `<table>...<tr><th>ID</th><th>Title</th><th>Download Count</th></tr>${data.join('')}</table>`,
  });
}
```

### 다운로드 TOP 5 조회 (VideoService)

```typescript
async findTop5Download() {
  return this.videoRepository.find({
    relations: ['user'],
    order: { downloadCnt: 'DESC' },
    take: 5,
  });
}
```

---

## 기술적 도전과 해결

| 문제 | 원인 | 해결 |
|---|---|---|
| `maxSize`가 동작하지 않음 | `addFileTypeValidator`에 잘못 전달 — 이 메서드는 `fileType`만 받음 | `addMaxSizeValidator({ maxSize })` 별도 체이닝 |
| `Namespace 'global.Express' has no exported member 'Multer'` | `@types/multer`의 global namespace augmentation이 자동 적용 안 됨 | `import 'multer'` side-effect import로 augmentation 강제 로드 |
| `@UploadedFile`과 `@Body()`가 같은 파라미터에 겹침 | 파일과 DTO 파라미터 분리 안 됨 | `file: Express.Multer.File`과 `createVideoReqDto`를 별도 파라미터로 분리 |
| `VideoService`를 `AnalyticsModule`에서 주입 불가 | `VideoModule`이 `VideoService`를 export하지 않음 | `VideoModule.exports`에 `VideoService` 추가 |

---

## 기술 선택 근거

**`ParseFilePipeBuilder` 사용:** 컨트롤러 내부에 검증 로직(`if (!file.mimetype...)`)을 작성하는 대신 NestJS 내장 파이프 체이닝으로 선언적으로 표현. 검증 실패 시 예외 처리 파이프라인이 자동 동작해 컨트롤러 코드가 간결해짐.

**`StreamableFile` + `createReadStream` 사용:** 파일 전체를 `Buffer`로 메모리에 올리는 대신 스트리밍. 수십 MB~GB 단위 영상 파일에서 메모리 초과를 방지하는 필수 패턴.

**`downloadCnt: () => 'download_cnt + 1'` (TypeORM raw expression):** Node.js에서 read-modify-write 방식(`cnt + 1`을 JS에서 계산 후 저장)은 동시 요청 시 race condition으로 카운트가 누락될 수 있다. DB 레벨에서 원자적으로 증가시켜 정합성 보장.

**`@Res({ passthrough: true })` + `StreamableFile`:** `@Res()`만 쓰면 NestJS의 interceptor/pipe 파이프라인이 우회된다. `passthrough: true`를 주면 헤더 직접 설정은 가능하면서 NestJS 처리 흐름은 유지됨.

**`@Cron` 데코레이터 (선언적 스케줄링):** `setInterval`로 직접 타이머를 관리하는 대신 `@nestjs/schedule`의 Cron 표현식을 사용. 스케줄 로직이 메서드 위에 명시적으로 선언되어 가독성이 높고, NestJS DI 컨테이너 안에서 동작해 의존성 주입이 자연스럽게 적용됨.

**`@nestjs-modules/mailer` 사용:** `nodemailer`를 직접 사용하는 것보다 ConfigModule과의 통합, transport 추상화, NestJS DI 지원이 내장되어 있어 설정 코드가 간결해짐.

---

## 성과 및 수치

- 파일 크기 제한: 5MB (초과 시 422 반환)
- 허용 파일 타입: mp4 전용
- 다운로드 Rate Limit: 분당 3회 (`@Throttle({ default: { limit: 3, ttl: 60000 } })`)
- 파일명 충돌 없음: UUID 기반 저장으로 중복 불가
- 메모리 사용: 파일 크기와 무관하게 스트리밍으로 일정
- 이메일 발송 주기: 매분 (개발), 매일 오전 10시 (프로덕션 전환 가능)
- TOP 5 집계: DB 레벨 `ORDER BY download_cnt DESC LIMIT 5`

---

## 배운 점

- `@types/multer`는 `Express` 전역 namespace를 augmentation하는 방식이라, 명시적 `import 'multer'` 없이는 TypeScript가 타입을 인식 못하는 경우가 있다
- NestJS의 `ParseFilePipeBuilder`는 메서드 체이닝 순서대로 검증이 실행된다 — `addFileTypeValidator`와 `addMaxSizeValidator`는 별개 메서드
- TypeORM에서 `() => 'raw_sql_expression'` 형태의 lambda를 사용하면 DB 레벨 연산이 가능 (원자적 증가, 계산 컬럼 등)
- `@Res()` decorator는 NestJS 파이프라인을 우회한다 — 헤더 조작이 필요하면 반드시 `{ passthrough: true }` 옵션을 써야 한다
- NestJS 모듈 간 서비스 공유는 `exports` 배열에 명시해야 한다 — 없으면 다른 모듈에서 주입 시 런타임 에러
- `@Cron` 데코레이터에서 `CronExpression` enum을 사용하면 cron 표현식 문자열(`'0 10 * * *'`) 오타 없이 가독성 있게 스케줄을 정의할 수 있다

---

## 관련 커밋 / PR

- `9dafef0` — Merge pull request #16 ND-8 CQRS (이 브랜치의 base)
- `39944e5` — #15 ND-8 CQRS (CommandBus, QueryBus, EventBus 도입)
- 현재 브랜치 변경/추가 파일:
  - `src/video/video.controller.ts` — 업로드/다운로드 파이프라인 완성
  - `src/video/video.service.ts` — findOne/download/findTop5Download 구현
  - `src/video/video.module.ts` — VideoService export 추가
  - `src/video/create-video.handler.ts` — 파일 저장 실제 구현
  - `src/analytics/analytics.service.ts` — Cron 스케줄러 등록
  - `src/analytics/analytics.module.ts` — ScheduleModule, VideoModule, EmailModule import
  - `src/email/email.module.ts` — MailerModule Gmail SMTP 설정 (신규)
  - `src/email/email.service.ts` — HTML 이메일 발송 로직 (신규)
  - `src/config/email.config.ts` — 이메일 환경변수 네임스페이스 설정 (신규)
  - `src/app.module.ts` — EmailModule, emailConfig 등록
  - `package.json` / `package-lock.json` — `@nestjs/schedule` v6.1.3 추가
