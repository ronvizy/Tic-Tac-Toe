import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { JoinRoomPayload, MovePayload, RestartPayload } from './game.types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly gameService: GameService) {}

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

      const { room, player } = this.gameService.joinRoom(client.id, payload);
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

  private emitError(client: Socket, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    client.emit('room:error', { message });
  }
}
