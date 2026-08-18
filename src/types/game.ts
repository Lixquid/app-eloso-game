export const BOARD_ROWS = 6;
export const BOARD_COLS = 5;
export const MAX_STACK_HEIGHT = 5;
export const PLAYER_START_ROW = BOARD_ROWS - 1;
export const BEAR_START_ROW = 0;
export const WIN_THRESHOLD = 10;
export const SKY_TARGET = 12;

export type Player = 'player' | 'bear';
export type Turn = 'player' | 'bear';

export interface Position {
  row: number;
  col: number;
}

export interface Stack {
  id: string;
  player: Player;
  pieces: number;
  position: Position;
}

export interface BearLogEntry {
  roll: number;
  column: number;
  action: string;
  details?: string;
}

export interface GameState {
  board: (Stack | null)[][];
  playerPiecesInSky: number;
  playerPiecesInPit: number;
  bearPiecesInCave: number;
  bearPiecesOnGround: number;
  currentTurn: Turn;
  selectedStackId: string | null;
  validMoves: Position[];
  gameOver: boolean;
  winner: 'player' | 'bear' | null;
  message: string;
  lastPlayerMove: { stackId: string; height: number } | null;
  bearLog: BearLogEntry[];
  animatingMove?: AnimatingMove | null;
  bearMoveQueue?: BearMove[];
  processingBearMoves?: boolean;
}

export interface BearMove {
  stack: Stack;
  from: Position;
  to: Position;
  action: 'move' | 'capture' | 'merge' | 'cave-to-board' | 'move-to-ground' | 'rain-back' | 'rain-back-capture' | 'rain-back-cave';
  details?: string;
  logEntry?: BearLogEntry;
}

export interface AnimatingMove {
  stack: Stack;
  from: Position;
  to: Position;
  startTime: number;
  duration: number;
}

export interface AuditResult {
  isValid: boolean;
  message: string;
  possibleCause?: string;
}

export const TOTAL_PIECES_PER_SIDE = 12;

export function createEmptyBoard(): Stack[][] {
  return Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));
}