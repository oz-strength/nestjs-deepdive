/**
 * CreateVideoHandler 단위 테스트
 *
 * 테스트 대상: CreateVideoHandler.execute()
 *   - CQRS 커맨드 핸들러로, CreateVideoCommand를 받아
 *     트랜잭션 내에서 Video를 저장하고 VideoCreatedEvent를 발행한다.
 *
 * 테스트 전략:
 *   - DataSource(QueryRunner), EventBus, fs/promises.writeFile을 mock하여
 *     외부 의존성(DB, 파일시스템)을 격리한다.
 *   - 정상 경로(happy path)와 에러 경로(error path)를 각각 검증한다.
 */

import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { DataSource } from 'typeorm';
import { CreateVideoCommand } from './command/create-video.command';
import { CreateVideoHandler } from './create-video.handler';
import { Video } from './entity/video.entity';
import { VideoCreatedEvent } from './event/video-created.event';

// --- Mock 데이터 ---

const MOCK_USER_ID = 'user-uuid-1234';
const MOCK_VIDEO_ID = 'video-uuid-5678';

// save()가 반환할 Video mock — id가 있어야 uploadVideo에서 파일명으로 사용됨
const mockSavedVideo = { id: MOCK_VIDEO_ID, title: 'test-video' } as Video;

// --- EntityManager mock ---
// QueryRunner.manager의 역할을 담당하며, DB 조작 메서드를 mock한다.
const mockManager = {
  findOneBy: jest.fn().mockResolvedValue({ id: MOCK_USER_ID }), // User 조회
  create: jest.fn().mockReturnValue(mockSavedVideo), // Video 인스턴스 생성 (동기)
  save: jest.fn().mockResolvedValue(mockSavedVideo), // Video 저장 후 반환
};

// --- QueryRunner mock ---
// 트랜잭션 생명주기(start/commit/rollback/release)를 mock한다.
const mockQueryRunner = {
  manager: mockManager,
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
};

// --- 테스트 스위트 ---

describe('CreateVideoHandler', () => {
  let handler: CreateVideoHandler;
  let eventBus: jest.Mocked<EventBus>;

  beforeEach(async () => {
    // 각 테스트마다 mock 호출 횟수를 초기화해 테스트 간 상태가 누적되지 않도록 한다.
    jest.clearAllMocks();

    // writeFile을 mock해 실제 파일시스템 접근을 차단한다.
    jest.spyOn(fs, 'writeFile').mockResolvedValue();

    const module = await Test.createTestingModule({
      providers: [
        CreateVideoHandler,
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner) },
        },
        {
          provide: EventBus,
          useValue: { publish: jest.fn() },
        },
      ],
    }).compile();

    handler = module.get(CreateVideoHandler);
    eventBus = module.get(EventBus);
  });

  describe('execute', () => {
    const command = new CreateVideoCommand(MOCK_USER_ID, 'test-video', 'video/mp4', 'mp4', Buffer.from(''));

    /**
     * 정상 경로(happy path)
     *
     * 검증 항목:
     *   1. 트랜잭션이 커밋되고 롤백은 호출되지 않는다.
     *   2. VideoCreatedEvent가 저장된 video.id를 담아 발행된다.
     *   3. 핸들러가 저장된 Video를 반환한다.
     */
    it('트랜잭션을 커밋하고 VideoCreatedEvent를 발행한다', async () => {
      const result = await handler.execute(command);

      // 트랜잭션 정상 종료 확인
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();

      // 올바른 video.id를 담은 이벤트가 발행됐는지 확인
      expect(eventBus.publish).toHaveBeenCalledWith(new VideoCreatedEvent(MOCK_VIDEO_ID));
      expect(eventBus.publish).toHaveBeenCalledTimes(1);

      // 저장된 Video 반환 확인
      expect(result).toEqual(mockSavedVideo);
    });

    /**
     * 에러 경로(error path) — DB 저장 실패 시
     *
     * 검증 항목:
     *   1. 트랜잭션이 롤백되고 커밋은 호출되지 않는다.
     *   2. 이벤트가 발행되지 않는다.
     *   3. 원래 에러가 그대로 throw된다.
     */
    it('DB 에러 발생 시 트랜잭션을 롤백하고 에러를 다시 던진다', async () => {
      mockManager.save.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(handler.execute(command)).rejects.toThrow('DB connection failed');

      // 트랜잭션 롤백 확인
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();

      // 이벤트 미발행 확인 — 커밋되지 않은 데이터에 대한 이벤트가 나가선 안 됨
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });
});
