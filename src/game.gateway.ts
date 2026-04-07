import {
  ConnectedSocket,
  OnGatewayConnection,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { JoinRoomPayload, MovePayload, RestartPayload, AuthenticatedSocketUser } from './game.types';
import { AuthService } from './auth.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gameService: GameService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.readToken(client);
      const user = await this.authService.getProfileFromToken(token);
      client.data.user = user;
      client.emit('chat:history', this.gameService.getChatMessages());
    } catch (error) {
      this.emitError(client, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const room = this.gameService.leaveRoom(client.id);
    if (room) {
      this.server.to(room.code).emit('room:update', this.gameService.toPublicRoom(room));
    }
  }

  @SubscribeMessage('room:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinRoomPayload): void {
    try {
      for (const roomName of client.rooms) {
        if (roomName !== client.id) {
          client.leave(roomName);
        }
      }

      const { room, player } = this.gameService.joinRoom(client.id, payload, this.getUser(client));
      client.join(room.code);
      client.emit('room:joined', {
        roomCode: room.code,
        playerMark: player.mark,
      });
      this.server.to(room.code).emit('room:update', this.gameService.toPublicRoom(room));
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket): void {
    const room = this.gameService.leaveRoom(client.id);
    for (const roomName of client.rooms) {
      if (roomName !== client.id) {
        client.leave(roomName);
      }
    }

    if (room) {
      this.server.to(room.code).emit('room:update', this.gameService.toPublicRoom(room));
    }
  }

  @SubscribeMessage('game:move')
  handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: MovePayload): void {
    try {
      const room = this.gameService.handleMove(client.id, payload);
      this.server.to(room.code).emit('room:update', this.gameService.toPublicRoom(room));
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('game:restart')
  handleRestart(@ConnectedSocket() client: Socket, @MessageBody() payload: RestartPayload): void {
    try {
      const room = this.gameService.restartRound(client.id, payload);
      this.server.to(room.code).emit('room:update', this.gameService.toPublicRoom(room));
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @SubscribeMessage('chat:send')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { text?: string },
  ): Promise<void> {
    try {
      const message = await this.gameService.addChatMessage(this.getUser(client), payload.text ?? '');
      this.server.emit('chat:message', message);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  private emitError(client: Socket, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    client.emit('room:error', { message });
  }

  private getUser(client: Socket): AuthenticatedSocketUser {
    const user = client.data.user as AuthenticatedSocketUser | undefined;
    if (!user) {
      throw new Error('Unauthenticated socket.');
    }

    return user;
  }

  private readToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken;
    }

    const bearerHeader = client.handshake.headers.authorization;
    if (typeof bearerHeader === 'string' && bearerHeader.startsWith('Bearer ')) {
      return bearerHeader.slice(7);
    }

    return undefined;
  }
}
