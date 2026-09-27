export const BOARD_ROWS = 6;
export const BOARD_COLS = 5;
export const MAX_STACK_HEIGHT = 5;
export const PLAYER_START_ROW = BOARD_ROWS - 1;
export const BEAR_START_ROW = 0;
export const WIN_THRESHOLD = 10;
export const SKY_TARGET = 12;
export const TOTAL_PIECES_PER_SIDE = 12;

/** Duration of a single animated move, shared by logic and UI. */
export const ANIMATION_DURATION_MS = 300;

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

export type Cell = Stack | null;
export type Board = Cell[][];

export interface BearLogEntry {
  roll: number;
  column: number;
  action: string;
  details?: string;
}

/** Resource counters after a bear step has been applied. */
export interface ResourceCounts {
  cave: number;
  ground: number;
  pit: number;
}

/**
 * One step of the bear's turn.
 *
 * The bear's whole turn is simulated up-front; each step carries a full
 * snapshot of the board, resources and log *after* the step is applied.
 * Replaying the steps by assigning these snapshots cannot drift from the
 * simulation, because nothing is re-computed during playback.
 */
export interface BearMove {
  stack: Stack;
  from: Position;
  to: Position;
  action:
    | 'move'
    | 'capture'
    | 'merge'
    | 'cave-to-board'
    | 'move-to-ground'
    | 'rain-back'
    | 'rain-back-capture'
    | 'rain-back-cave';
  boardAfter: Board;
  resourcesAfter: ResourceCounts;
  logSoFar: BearLogEntry[];
}

export interface GameState {
  board: Board;
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
  /** The bear step currently waiting to be animated, if any. */
  currentBearStep: BearMove | null;
  bearMoveQueue: BearMove[];
}

export interface AuditResult {
  isValid: boolean;
  message: string;
  possibleCause?: string;
}

export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      row.push(null);
    }
    board.push(row);
  }
  return board;
}