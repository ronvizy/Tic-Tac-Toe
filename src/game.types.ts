export type Mark = 'X' | 'O';
export type GameType = 'classic' | 'three-move';
export type RoundStatus = 'waiting' | 'active' | 'won' | 'draw';

export interface PlayerState {
  socketId: string;
  userId: string;
  name: string;
  mark: Mark;
}

export interface RoomState {
  code: string;
  gameType: GameType;
  players: PlayerState[];
  board: string[];
  currentPlayer: Mark;
  scores: Record<Mark, number>;
  moveHistory: Record<Mark, number[]>;
  roundStatus: RoundStatus;
  winnerMark: Mark | null;
  winningLine: number[];
}

export interface JoinRoomPayload {
  action: 'create' | 'join';
  roomCode?: string;
  gameType: GameType;
}

export interface MovePayload {
  roomCode: string;
  index: number;
}

export interface RestartPayload {
  roomCode: string;
}

export interface PublicRoomState {
  roomCode: string;
  gameType: GameType;
  players: Array<Pick<PlayerState, 'name' | 'mark'>>;
  board: string[];
  currentPlayer: Mark;
  scores: Record<Mark, number>;
  moveHistory: Record<Mark, number[]>;
  roundStatus: RoundStatus;
  winnerMark: Mark | null;
  winningLine: number[];
}

export interface AuthenticatedSocketUser {
  id: string;
  username: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}
