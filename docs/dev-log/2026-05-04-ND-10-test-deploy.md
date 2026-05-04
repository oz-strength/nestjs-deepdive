# 테스트 코드 작성 및 Docker 배포 환경 구성 개발 기록

## 메타
- **날짜:** 2026-05-04
- **브랜치:** feature/ND-10-test-deploy
- **커밋:** 9104c73 (base) — 미커밋 작업 기록
- **PR:** 없음

## 주요 기능
> CQRS 핸들러 단위 테스트 작성, TypeORM 설정 환경변수화, Docker 멀티스테이지 빌드 및 운영/로컬 환경 분리

- `CreateVideoHandler` 단위 테스트 작성 (happy path / error path)
- `ormconfig.ts` 하드코딩 제거 → `process.env` 관리
- `Dockerfile` 멀티스테이지 빌드 구성
- `docker-compose.yml` 로컬 인프라 전용 / `docker-compose.prod.yml` 운영 배포 분리
- `tsconfig.json`에 `"types": ["jest"]` 추가로 IDE 타입 인식 문제 해결

## 사용 기술 스택
`NestJS` `Jest` `TypeORM` `Docker` `Docker Compose` `PostgreSQL` `TypeScript`

## 구현 방법

### 1. CreateVideoHandler 단위 테스트

`CreateVideoHandler.execute()`는 TypeORM `QueryRunner`로 트랜잭션을 관리하고, 성공 시 `VideoCreatedEvent`를 발행한다. 외부 의존성이 많아 격리가 핵심이었다.

**격리 전략:**
- `DataSource.createQueryRunner()`를 mock해 실제 DB 연결 차단
- `fs/promises.writeFile`을 `jest.spyOn`으로 mock해 실제 파일 시스템 접근 차단
- `EventBus`를 `useValue`로 교체

**테스트 케이스 구성:**

```typescript
// happy path: 트랜잭션 커밋 + 이벤트 발행 검증
expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
expect(eventBus.publish).toHaveBeenCalledWith(new VideoCreatedEvent(MOCK_VIDEO_ID));

// error path: 롤백 + 이벤트 미발행 + 에러 re-throw 검증
mockManager.save.mockRejectedValueOnce(new Error('DB connection failed'));
await expect(handler.execute(command)).rejects.toThrow('DB connection failed');
expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
expect(eventBus.publish).not.toHaveBeenCalled();
```

**`beforeEach` + `jest.clearAllMocks()` 사용:** `beforeAll`을 쓰면 mock 호출 횟수가 테스트 간 누적되어 `toBeCalledTimes(1)` 검증이 두 번째 테스트부터 깨진다.

### 2. ormconfig.ts 환경변수화

TypeORM CLI는 NestJS `ConfigModule`을 거치지 않고 `ormconfig.ts`를 직접 실행하므로, `.env` 파일이 자동 로드되지 않는 문제가 있었다. 하지만 Docker 환경에서는 `env_file`로 환경변수가 주입되므로 `dotenv` 별도 호출 없이 `process.env`만으로 충분하다.

```typescript
export const AppDataSource = new DataSource({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT),
  ...
});
```

### 3. Dockerfile 멀티스테이지 빌드

```dockerfile
# builder: 전체 의존성 + 빌드
FROM node:24.15.0-alpine AS builder
COPY scripts ./scripts   # postinstall.js가 npm ci 중 실행되므로 먼저 복사
RUN npm ci && npm run build

# runner: prod 의존성만 + dist 복사
FROM node:24.15.0-alpine AS runner
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
CMD ["sh", "-c", "node ./node_modules/typeorm/cli.js migration:run -d dist/ormconfig.js && node dist/main"]
```

migration 실행 시 `ts-node`(devDependency)가 없으므로 컴파일된 `dist/ormconfig.js`를 `node`로 직접 실행한다. `ormconfig.ts`가 `typeorm`만 import하므로 path alias 문제가 없다.

### 4. Docker Compose 환경 분리

| 파일 | 용도 | app 서비스 |
|---|---|---|
| `docker-compose.yml` | 로컬 개발 — 인프라만 | 없음 |
| `docker-compose.prod.yml` | 운영 배포 | `image: ${IMAGE_TAG}` |

운영에서는 `build` 대신 CI가 빌드/푸시한 이미지를 `IMAGE_TAG`로 지정해 pull한다.

```bash
# 운영 배포
IMAGE_TAG=myrepo/nestjs-deepdive:abc1234 docker compose -f docker-compose.prod.yml up -d
```

## 기술적 도전과 해결

| 문제 | 원인 | 해결 |
|---|---|---|
| IDE에서 `describe` 타입 에러 | `tsconfig.json`에 `types` 필드 없어 Jest 전역 타입 미인식 | `"types": ["jest"]` 추가 |
| `manager.save()` mock이 `id` 없는 객체 반환 | mock 반환값 미설정 → `uploadVideo(video.id)`에서 `undefined` 사용 | `mockResolvedValue({ id: MOCK_VIDEO_ID, ... })` 명시 |
| runner 스테이지에서 `npm ci` 실패 | `postinstall.js`가 `COPY . .` 이전에 `npm ci` 실행 중 호출됨 | `scripts/` 폴더를 양 스테이지 모두 `npm ci` 앞에 복사 |
| migration 시 DB 연결 거부 (`ECONNREFUSED :5434`) | `.env`의 `POSTGRES_PORT=5434`(호스트 포트)가 컨테이너 내부로 그대로 전달됨 | `docker-compose.prod.yml` environment에서 `POSTGRES_PORT=5432`로 오버라이드 |
| `npm run typeorm migration:run` 실패 | runner 스테이지에 `ts-node`, `tsconfig-paths`가 없음(devDependency) | `node ./node_modules/typeorm/cli.js migration:run -d dist/ormconfig.js`로 변경 |

## 기술 선택 근거

- **멀티스테이지 빌드:** devDependency와 소스코드를 최종 이미지에서 제외해 이미지 크기 감소 및 공격 표면 축소
- **`docker-compose.prod.yml`에서 `build` 대신 `image`:** 서버가 소스코드를 보유하지 않아도 되며, CI에서 빌드한 검증된 이미지만 배포 가능 → 환경 일관성 확보
- **`beforeEach` + `clearAllMocks`:** 테스트 순서 의존성 제거. `beforeAll`은 mock 상태가 누적되어 테스트 추가 시 암묵적으로 깨질 수 있음
- **`jest.spyOn(fs, 'writeFile')`:** 실제 파일 시스템 I/O를 막아 테스트 환경에 부작용 없음. `jest.mock('fs/promises')`보다 세밀하게 특정 메서드만 mock 가능

## 성과 및 수치

- Docker 이미지 빌드 성공 및 컨테이너 기동 확인 (`/health` API 응답: `{"status":"ok","info":{"database":{"status":"up"}}}`)
- 단위 테스트 2개 추가 (happy path / error path), 커버리지 향상
- `ormconfig.ts` 하드코딩 5개 항목 전부 환경변수화

## 배운 점

- **Docker 컨테이너 내부 포트 vs 호스트 포트:** `5434:5432`에서 컨테이너끼리 통신할 때는 내부 포트(5432)를 써야 한다. `docker-compose.yml`의 `environment`로 `.env` 값을 오버라이드하는 패턴이 유용하다.
- **`postinstall` 스크립트와 Docker 레이어 순서:** `npm ci` 실행 시 `postinstall`이 트리거되므로, 해당 스크립트가 의존하는 파일은 반드시 앞 레이어에서 복사해야 한다.
- **TypeORM CLI는 NestJS DI 컨테이너 밖에서 실행됨:** `ConfigModule`, 미들웨어 등이 전혀 개입하지 않으므로 `ormconfig.ts`는 독립적으로 env를 읽어야 한다.
- **현업 Docker 배포 패턴:** 로컬 개발 시 앱은 직접 실행, DB만 컨테이너로 운영. CI가 이미지를 빌드/푸시하고 서버는 pull만 하는 구조가 표준적이다.

## 관련 커밋 / PR
- base: `9104c73` — Merge pull request #18 (ND-9 file upload & task schedule)
- 현재 브랜치: `feature/ND-10-test-deploy` (미커밋)
