import { Test, TestingModule } from '@nestjs/testing';
import { WsException } from '@nestjs/websockets';
import { WinMethod } from '@prisma/client';
import { ScoreboardGateway } from './scoreboard.gateway';
import { ScoreboardService } from './scoreboard.service';
import { MatService } from './mat.service';

describe('ScoreboardGateway osaekomi resolution', () => {
  let gateway: ScoreboardGateway;
  let scoreboardService: { applyScoreEvent: jest.Mock };
  let matService: { verifyPin: jest.Mock };
  let serverEmit: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers();
    serverEmit = jest.fn();
    scoreboardService = { applyScoreEvent: jest.fn() };
    matService = { verifyPin: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreboardGateway,
        { provide: ScoreboardService, useValue: scoreboardService },
        { provide: MatService, useValue: matService },
      ],
    }).compile();

    gateway = module.get<ScoreboardGateway>(ScoreboardGateway);
    // Inject a fake socket.io server: server.to(room).emit(...)
    (gateway as unknown as { server: { to: (r: string) => { emit: jest.Mock } } }).server = {
      to: () => ({ emit: serverEmit }),
    };
    // Treat the test "client" as a controller
    (gateway as unknown as { isController: () => boolean }).isController = () => true;
    (gateway as unknown as { getClientRoom: () => string }).getClientRoom = () => 'mat:test';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function fakeClient() {
    return { id: 'sock-1', join: jest.fn(), emit: jest.fn() } as never;
  }

  it('stop before 10s awards no score', async () => {
    await gateway.handleStartOsaekomi(fakeClient(), { matchId: 'm1', competitorId: 'c1' });
    jest.advanceTimersByTime(5000);
    await gateway.handleStopOsaekomi(fakeClient(), { matchId: 'm1' });

    expect(scoreboardService.applyScoreEvent).not.toHaveBeenCalled();
    // osaekomi-stopped should still be emitted
    expect(serverEmit).toHaveBeenCalledWith('osaekomi-stopped', expect.objectContaining({
      matchId: 'm1', autoTerminated: false,
    }));
  });

  it('stop between 10s and 20s awards WAZA_ARI', async () => {
    scoreboardService.applyScoreEvent.mockResolvedValue({
      match: { scores: { competitor1: { wazaAri: 1, yuko: 0, shido: 0 } } },
      terminated: false,
    });

    await gateway.handleStartOsaekomi(fakeClient(), { matchId: 'm1', competitorId: 'c1' });
    jest.advanceTimersByTime(15_000);
    await gateway.handleStopOsaekomi(fakeClient(), { matchId: 'm1' });

    expect(scoreboardService.applyScoreEvent).toHaveBeenCalledWith('m1', expect.objectContaining({
      type: 'WAZA_ARI', competitorId: 'c1',
    }));
  });

  it('stop at 20s+ awards IPPON and emits match-ended if terminated', async () => {
    scoreboardService.applyScoreEvent.mockResolvedValue({
      match: { scores: { competitor1: { wazaAri: 0, yuko: 0, shido: 0 } } },
      terminated: true,
      winnerId: 'c1',
      winMethod: 'IPPON',
    });

    await gateway.handleStartOsaekomi(fakeClient(), { matchId: 'm1', competitorId: 'c1' });
    // advance past auto-terminate threshold via setTimeout firing
    await jest.advanceTimersByTimeAsync(20_000);

    expect(scoreboardService.applyScoreEvent).toHaveBeenCalledWith('m1', expect.objectContaining({
      type: 'IPPON', competitorId: 'c1',
    }));
    expect(serverEmit).toHaveBeenCalledWith('match-ended', expect.objectContaining({
      matchId: 'm1', winnerId: 'c1', winMethod: 'IPPON',
    }));
  });

  it('starting osaekomi cancels any existing tracker for the same match', async () => {
    await gateway.handleStartOsaekomi(fakeClient(), { matchId: 'm1', competitorId: 'c1' });
    jest.advanceTimersByTime(8_000);
    // restart osaekomi for the OTHER competitor
    await gateway.handleStartOsaekomi(fakeClient(), { matchId: 'm1', competitorId: 'c2' });

    // The first 20s timer should have been cleared. Advance another 12s (total since first start = 20s)
    // — should NOT auto-fire (would mean stale timer still alive)
    await jest.advanceTimersByTimeAsync(12_000);

    expect(scoreboardService.applyScoreEvent).not.toHaveBeenCalled();
  });

  it('stop with no active tracker is a no-op', async () => {
    await gateway.handleStopOsaekomi(fakeClient(), { matchId: 'unknown' });

    expect(scoreboardService.applyScoreEvent).not.toHaveBeenCalled();
    expect(serverEmit).not.toHaveBeenCalled();
  });
});

// ENG-Q4: socket-boundary validation for end-match winMethod.
describe('ScoreboardGateway handleEndMatch validation', () => {
  let gateway: ScoreboardGateway;
  let scoreboardService: { endMatch: jest.Mock };

  beforeEach(async () => {
    scoreboardService = { endMatch: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreboardGateway,
        { provide: ScoreboardService, useValue: scoreboardService },
        { provide: MatService, useValue: { verifyPin: jest.fn() } },
      ],
    }).compile();
    gateway = module.get<ScoreboardGateway>(ScoreboardGateway);
    (gateway as unknown as { server: { to: (r: string) => { emit: jest.Mock } } }).server = {
      to: () => ({ emit: jest.fn() }),
    };
    (gateway as unknown as { isController: () => boolean }).isController = () => true;
    (gateway as unknown as { getClientRoom: () => string }).getClientRoom = () => 'mat:test';
  });

  function fakeClient() {
    return { id: 'sock-1', join: jest.fn(), emit: jest.fn() } as never;
  }

  it('accepts every valid WinMethod enum value', async () => {
    for (const winMethod of Object.values(WinMethod)) {
      scoreboardService.endMatch.mockClear();
      await gateway.handleEndMatch(fakeClient(), {
        matchId: 'm1',
        winnerId: 'c1',
        winMethod,
      });
      expect(scoreboardService.endMatch).toHaveBeenCalledWith('m1', 'c1', winMethod);
    }
  });

  it('rejects an unknown winMethod string with WsException (does not reach the service)', async () => {
    await expect(
      gateway.handleEndMatch(fakeClient(), {
        matchId: 'm1',
        winnerId: 'c1',
        winMethod: 'NOT_A_REAL_METHOD',
      }),
    ).rejects.toThrow(WsException);
    expect(scoreboardService.endMatch).not.toHaveBeenCalled();
  });

  it('rejects a junk-cased valid name (case-sensitive enum match)', async () => {
    await expect(
      gateway.handleEndMatch(fakeClient(), {
        matchId: 'm1',
        winnerId: 'c1',
        winMethod: 'ippon', // lowercase — not the canonical enum value
      }),
    ).rejects.toThrow(WsException);
    expect(scoreboardService.endMatch).not.toHaveBeenCalled();
  });
});
