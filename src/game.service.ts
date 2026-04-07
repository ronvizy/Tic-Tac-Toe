import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChatMessage,
  GameType,
  JoinRoomPayload,
  Mark,
  MovePayload,
  PlayerState,
  PublicRoomState,
  RestartPayload,
  RoomState,
} from './game.types';
import { StorageService } from './storage.service';

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

@Injectable()
export class GameService {
  private readonly rooms = new Map<string, RoomState>();
  private chatMessages: ChatMessage[] = [];

  constructor(private readonly storageService: StorageService) {
    void this.hydrateChatMessages();
  }

  joinRoom(
    socketId: string,
    payload: JoinRoomPayload,
    user: { id: string; username: string },
  ): { room: RoomState; player: PlayerState } {
    const roomCode = this.normalizeRoomCode(payload.roomCode);
    const requestedType = payload.gameType ?? 'classic';
    const playerName = user.username;

    let room = this.rooms.get(roomCode);
    if (!room && payload.action === 'create') {
      room = this.createRoom(roomCode, requestedType);
      this.rooms.set(roomCode, room);
    }

    if (!room) {
      throw new NotFoundException('Room not found. Check the room code and try again.');
    }

    const existingPlayer = room.players.find((player) => player.socketId === socketId);
    if (existingPlayer) {
      return { room, player: existingPlayer };
    }

    if (room.players.length >= 2) {
      throw new BadRequestException('That room is already full.');
    }

    const player: PlayerState = {
      socketId,
      userId: user.id,
      name: playerName,
      mark: room.players.some((entry) => entry.mark === 'X') ? 'O' : 'X',
    };

    room.players.push(player);
    if (room.players.length === 2) {
      room.roundStatus = 'active';
    }

    return { room, player };
  }

  leaveRoom(socketId: string): RoomState | null {
    const room = this.findRoomBySocketId(socketId);
    if (!room) {
      return null;
    }

    room.players = room.players.filter((player) => player.socketId !== socketId);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return null;
    }

    this.resetRound(room);
    room.roundStatus = 'waiting';
    return room;
  }

  handleMove(socketId: string, payload: MovePayload): RoomState {
    const room = this.getRoom(payload.roomCode);
    const player = room.players.find((entry) => entry.socketId === socketId);

    if (!player) {
      throw new BadRequestException('You are not part of this room.');
    }

    if (room.roundStatus !== 'active') {
      throw new BadRequestException('The round is not active yet.');
    }

    if (player.mark !== room.currentPlayer) {
      throw new BadRequestException("It isn't your turn.");
    }

    if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index > 8) {
      throw new BadRequestException('That cell is out of range.');
    }

    if (room.board[payload.index] !== '') {
      throw new BadRequestException('That cell is already occupied.');
    }

    if (room.gameType === 'three-move' && room.moveHistory[player.mark].length === 3) {
      const oldestMove = room.moveHistory[player.mark].shift();
      if (oldestMove !== undefined) {
        room.board[oldestMove] = '';
      }
    }

    room.board[payload.index] = player.mark;
    if (room.gameType === 'three-move') {
      room.moveHistory[player.mark].push(payload.index);
    }

    const winningLine = WINNING_LINES.find(([a, b, c]) => {
      return room.board[a] === player.mark && room.board[b] === player.mark && room.board[c] === player.mark;
    });

    if (winningLine) {
      room.roundStatus = 'won';
      room.winnerMark = player.mark;
      room.winningLine = [...winningLine];
      room.scores[player.mark] += 1;
      return room;
    }

    if (room.gameType === 'classic' && room.board.every((cell) => cell !== '')) {
      room.roundStatus = 'draw';
      room.winnerMark = null;
      room.winningLine = [];
      return room;
    }

    room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
    return room;
  }

  restartRound(socketId: string, payload: RestartPayload): RoomState {
    const room = this.getRoom(payload.roomCode);
    if (!room.players.some((player) => player.socketId === socketId)) {
      throw new BadRequestException('You are not part of this room.');
    }

    this.resetRound(room);
    room.roundStatus = room.players.length === 2 ? 'active' : 'waiting';
    return room;
  }

  toPublicRoom(room: RoomState): PublicRoomState {
    return {
      roomCode: room.code,
      gameType: room.gameType,
      players: room.players.map(({ name, mark }) => ({ name, mark })),
      board: [...room.board],
      currentPlayer: room.currentPlayer,
      scores: { ...room.scores },
      moveHistory: {
        X: [...room.moveHistory.X],
        O: [...room.moveHistory.O],
      },
      roundStatus: room.roundStatus,
      winnerMark: room.winnerMark,
      winningLine: [...room.winningLine],
    };
  }

  getChatMessages(): ChatMessage[] {
    return this.chatMessages.map((message) => ({ ...message }));
  }

  async addChatMessage(user: { id: string; username: string }, text: string): Promise<ChatMessage> {
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    if (!normalizedText) {
      throw new BadRequestException('Message cannot be empty.');
    }

    if (normalizedText.length > 280) {
      throw new BadRequestException('Message must be 280 characters or fewer.');
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: user.id,
      username: user.username,
      text: normalizedText,
      createdAt: new Date().toISOString(),
    };

    this.chatMessages = [...this.chatMessages, message].slice(-100);
    const data = await this.storageService.read();
    data.chatMessages = this.chatMessages;
    await this.storageService.write(data);
    return message;
  }

  private getRoom(roomCode: string): RoomState {
    const normalizedCode = this.normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new NotFoundException('Room not found.');
    }

    return room;
  }

  private findRoomBySocketId(socketId: string): RoomState | undefined {
    return [...this.rooms.values()].find((room) =>
      room.players.some((player) => player.socketId === socketId),
    );
  }

  private createRoom(code: string, gameType: GameType): RoomState {
    return {
      code,
      gameType,
      players: [],
      board: Array(9).fill(''),
      currentPlayer: 'X',
      scores: { X: 0, O: 0 },
      moveHistory: { X: [], O: [] },
      roundStatus: 'waiting',
      winnerMark: null,
      winningLine: [],
    };
  }

  private resetRound(room: RoomState): void {
    room.board = Array(9).fill('');
    room.currentPlayer = 'X';
    room.moveHistory = { X: [], O: [] };
    room.winnerMark = null;
    room.winningLine = [];
  }

  private normalizeRoomCode(roomCode?: string): string {
    const cleaned = (roomCode ?? this.generateRoomCode()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!cleaned) {
      return this.generateRoomCode();
    }

    return cleaned;
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async hydrateChatMessages(): Promise<void> {
    const data = await this.storageService.read();
    this.chatMessages = data.chatMessages.slice(-100);
  }
}
