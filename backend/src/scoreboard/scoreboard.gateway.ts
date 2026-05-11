import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WinMethod } from '@prisma/client';
import { ScoreboardService, ScoreEvent } from './scoreboard.service';
import { MatService } from './mat.service';

// Canonical set of WinMethod values, captured at module load. Use this
// instead of `Object.values(WinMethod)` inside the handler to avoid
// re-evaluating the enum on every socket message.
const VALID_WIN_METHODS = new Set<string>(Object.values(WinMethod));

interface OsaekomiTracker {
  competitorId: string;
  startedAt: number;
  room: string;
  timer: ReturnType<typeof setTimeout>;
}

const OSAEKOMI_WAZA_ARI_MS = 10_000;
const OSAEKOMI_IPPON_MS = 20_000;

@WebSocketGateway({ namespace: '/scoreboard', cors: { origin: '*' } })
export class ScoreboardGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private controllers = new Map<string, Set<string>>();
  private osaekomi = new Map<string, OsaekomiTracker>();

  constructor(
    private scoreboardService: ScoreboardService,
    private matService: MatService,
  ) {}

  handleDisconnect(client: Socket) {
    for (const [room, sockets] of this.controllers.entries()) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.controllers.delete(room);
    }
  }

  @SubscribeMessage('join-mat')
  async handleJoinMat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matId: string; pin?: string },
  ) {
    const room = `mat:${data.matId}`;
    client.join(room);

    let role: 'controller' | 'viewer' = 'viewer';
    if (data.pin) {
      const valid = await this.matService.verifyPin(data.matId, data.pin);
      if (valid) {
        role = 'controller';
        if (!this.controllers.has(room)) {
          this.controllers.set(room, new Set());
        }
        this.controllers.get(room)!.add(client.id);
      }
    }

    client.emit('role', { role });

    const state = await this.scoreboardService.getMatState(data.matId);
    if (state.match) {
      client.emit('match-state', state.match);
    }
  }

  @SubscribeMessage('score-event')
  async handleScoreEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; event: ScoreEvent },
  ) {
    if (!this.isController(client)) return;

    const result = await this.scoreboardService.applyScoreEvent(data.matchId, data.event);
    const room = this.getClientRoom(client);

    this.server.to(room).emit('score-update', {
      matchId: data.matchId,
      scores: result.match.scores,
      event: data.event,
    });

    if (result.terminated) {
      this.server.to(room).emit('match-ended', {
        matchId: data.matchId,
        winnerId: result.winnerId,
        winMethod: result.winMethod,
      });
    }
  }

  @SubscribeMessage('start-match')
  async handleStartMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!this.isController(client)) return;

    const match = await this.scoreboardService.startMatch(data.matchId);
    const room = this.getClientRoom(client);

    this.server.to(room).emit('match-started', { matchId: data.matchId });
    this.server.to(room).emit('match-state', match);
  }

  @SubscribeMessage('end-match')
  async handleEndMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; winnerId: string; winMethod: string },
  ) {
    if (!this.isController(client)) return;

    // Runtime validation at the trust boundary. `data.winMethod` is an
    // arbitrary string from the socket — without this guard, Prisma would
    // reject the bad value at write time with an opaque error after the
    // service tries to update. Surface a clean WsException instead.
    if (!VALID_WIN_METHODS.has(data.winMethod)) {
      throw new WsException(`Invalid winMethod: ${data.winMethod}`);
    }
    const winMethod = data.winMethod as WinMethod;

    await this.scoreboardService.endMatch(data.matchId, data.winnerId, winMethod);
    const room = this.getClientRoom(client);

    this.server.to(room).emit('match-ended', {
      matchId: data.matchId,
      winnerId: data.winnerId,
      winMethod,
    });
  }

  @SubscribeMessage('start-osaekomi')
  async handleStartOsaekomi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; competitorId: string },
  ) {
    if (!this.isController(client)) return;

    const room = this.getClientRoom(client);
    const startedAt = Date.now();

    const existing = this.osaekomi.get(data.matchId);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      void this.resolveOsaekomi(data.matchId, true);
    }, OSAEKOMI_IPPON_MS);

    this.osaekomi.set(data.matchId, {
      competitorId: data.competitorId,
      startedAt,
      room,
      timer,
    });

    this.server.to(room).emit('osaekomi-started', {
      matchId: data.matchId,
      competitorId: data.competitorId,
      startTime: startedAt,
    });
  }

  @SubscribeMessage('stop-osaekomi')
  async handleStopOsaekomi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!this.isController(client)) return;
    await this.resolveOsaekomi(data.matchId, false);
  }

  private async resolveOsaekomi(matchId: string, autoTerminated: boolean) {
    const state = this.osaekomi.get(matchId);
    if (!state) return;
    clearTimeout(state.timer);
    this.osaekomi.delete(matchId);

    const elapsedMs = autoTerminated
      ? OSAEKOMI_IPPON_MS
      : Date.now() - state.startedAt;

    this.server.to(state.room).emit('osaekomi-stopped', {
      matchId,
      elapsedMs,
      autoTerminated,
    });

    if (elapsedMs >= OSAEKOMI_IPPON_MS) {
      const result = await this.scoreboardService.applyScoreEvent(matchId, {
        type: 'IPPON',
        competitorId: state.competitorId,
        timestamp: Date.now(),
      });
      this.server.to(state.room).emit('score-update', {
        matchId,
        scores: result.match.scores,
        event: { type: 'OSAEKOMI_IPPON', competitorId: state.competitorId },
      });
      if (result.terminated) {
        this.server.to(state.room).emit('match-ended', {
          matchId,
          winnerId: result.winnerId,
          winMethod: result.winMethod,
        });
      }
    } else if (elapsedMs >= OSAEKOMI_WAZA_ARI_MS) {
      const result = await this.scoreboardService.applyScoreEvent(matchId, {
        type: 'WAZA_ARI',
        competitorId: state.competitorId,
        timestamp: Date.now(),
      });
      this.server.to(state.room).emit('score-update', {
        matchId,
        scores: result.match.scores,
        event: { type: 'OSAEKOMI_WAZA_ARI', competitorId: state.competitorId },
      });
      if (result.terminated) {
        this.server.to(state.room).emit('match-ended', {
          matchId,
          winnerId: result.winnerId,
          winMethod: result.winMethod,
        });
      }
    }
  }

  @SubscribeMessage('start-golden-score')
  async handleStartGoldenScore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!this.isController(client)) return;

    await this.scoreboardService.enableGoldenScore(data.matchId);
    const match = await this.scoreboardService.getMatchState(data.matchId);
    const room = this.getClientRoom(client);

    this.server.to(room).emit('match-state', match);
  }

  private isController(client: Socket): boolean {
    for (const [, sockets] of this.controllers.entries()) {
      if (sockets.has(client.id)) return true;
    }
    return false;
  }

  private getClientRoom(client: Socket): string {
    const rooms = Array.from(client.rooms);
    return rooms.find((r) => r.startsWith('mat:')) || rooms[1] || rooms[0];
  }
}
