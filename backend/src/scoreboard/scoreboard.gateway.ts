import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScoreboardService, ScoreEvent } from './scoreboard.service';
import { MatService } from './mat.service';

@WebSocketGateway({ namespace: '/scoreboard' })
export class ScoreboardGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private controllers = new Map<string, Set<string>>();

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

    await this.scoreboardService.endMatch(data.matchId, data.winnerId, data.winMethod);
    const room = this.getClientRoom(client);

    this.server.to(room).emit('match-ended', {
      matchId: data.matchId,
      winnerId: data.winnerId,
      winMethod: data.winMethod,
    });
  }

  @SubscribeMessage('start-osaekomi')
  async handleStartOsaekomi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; competitorId: string },
  ) {
    if (!this.isController(client)) return;

    const room = this.getClientRoom(client);
    const startTime = Date.now();

    this.server.to(room).emit('osaekomi-started', {
      matchId: data.matchId,
      competitorId: data.competitorId,
      startTime,
    });
  }

  @SubscribeMessage('stop-osaekomi')
  async handleStopOsaekomi(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    if (!this.isController(client)) return;

    const room = this.getClientRoom(client);
    this.server.to(room).emit('osaekomi-stopped', { matchId: data.matchId });
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
