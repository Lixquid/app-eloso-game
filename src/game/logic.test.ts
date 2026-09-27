import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  getValidMoves,
  selectStack,
  moveStack,
  processNextBearMove,
  auditGameState,
} from './logic';
import { setRandomSource, resetRandomSource } from './utils';
import {
  createEmptyBoard,
  BOARD_ROWS,
  BOARD_COLS,
  type GameState,
  type Stack,
  type Board,
} from '../types/game';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function stack(player: 'player' | 'bear', pieces: number, row: number, col: number): Stack {
  return {
    id: `${player}-${idCounter++}`,
    player,
    pieces,
    position: { row, col },
  };
}

function boardWith(entries: Stack[]): Board {
  const board = createEmptyBoard();
  for (const s of entries) board[s.position.row][s.position.col] = s;
  return board;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    board: createEmptyBoard(),
    playerPiecesInSky: 0,
    playerPiecesInPit: 0,
    bearPiecesInCave: 0,
    bearPiecesOnGround: 0,
    currentTurn: 'player',
    selectedStackId: null,
    validMoves: [],
    gameOver: false,
    winner: null,
    message: '',
    lastPlayerMove: null,
    bearLog: [],
    currentBearStep: null,
    bearMoveQueue: [],
    ...overrides,
  };
}

/** Raw rng value that produces the given die face. */
function face(faceValue: number): number {
  return (faceValue - 0.5) / 6;
}

/**
 * Synchronously play out a bear turn by replaying the animation queue,
 * asserting the piece-conservation audit after every step.
 */
function finishBearTurn(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.currentTurn === 'bear' && !s.gameOver) {
    s = processNextBearMove(s);
    const audit = auditGameState(s);
    if (!audit.isValid) {
      throw new Error(`audit failed mid-bear-turn: ${audit.message}`);
    }
    if (++guard > 1000) throw new Error('bear turn did not terminate');
  }
  return s;
}

/** Pass the player's turn with the given stack (still triggers the bear's dice). */
function passTurn(state: GameState, stackId: string): GameState {
  const selected = selectStack(state, stackId);
  const s = selected.board.flat().find(st => st?.id === stackId);
  if (!s) throw new Error('stack not found');
  return moveStack(selected, s.position);
}

beforeEach(() => {
  resetRandomSource();
  idCounter = 0;
});

// Standard player back row used in fixtures: heights 1, 5, 1, 5 (sums 12 with a 5 elsewhere).
// Standard bear fixtures keep the total at 12 including the cave.

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('createInitialState', () => {
  it('conserves 12 pieces per side on the starting rows', () => {
    const state = createInitialState();
    expect(auditGameState(state).isValid).toBe(true);

    for (const row of state.board) {
      for (const s of row) {
        if (s) expect(s.pieces).toBeLessThanOrEqual(5);
      }
    }
    for (let col = 0; col < BOARD_COLS; col++) {
      expect(state.board[BOARD_ROWS - 1][col]?.player).toBe('player');
      expect(state.board[0][col]?.player).toBe('bear');
    }
  });
});

// ---------------------------------------------------------------------------
// Player movement
// ---------------------------------------------------------------------------

describe('getValidMoves', () => {
  it('excludes straight forward/backward moves', () => {
    const board = boardWith([stack('player', 2, 4, 2)]);
    const moves = getValidMoves(board, board[4][2]!);
    expect(moves.some(m => m.col === 2)).toBe(false);
  });

  it('limits distance to the stack height', () => {
    const board = boardWith([stack('player', 1, 4, 2)]);
    const moves = getValidMoves(board, board[4][2]!);
    expect(moves.every(m => Math.abs(m.row - 4) <= 1 && Math.abs(m.col - 2) <= 1)).toBe(true);
  });

  it('is blocked by intervening stacks', () => {
    const board = boardWith([
      stack('player', 3, 4, 0),
      stack('player', 1, 3, 1),
    ]);
    const moves = getValidMoves(board, board[4][0]!);
    // (3,1) blocks the diagonal, so nothing on that diagonal is reachable
    expect(moves.some(m => m.row === 3 && m.col === 1)).toBe(false);
    expect(moves.some(m => m.row === 2 && m.col === 2)).toBe(false);
  });

  it('offers sky moves only from the top row, diagonally, one step', () => {
    const board = boardWith([stack('player', 3, 0, 1)]);
    const moves = getValidMoves(board, board[0][1]!);
    expect(moves).toContainEqual({ row: -1, col: 0 });
    expect(moves).toContainEqual({ row: -1, col: 2 });
    expect(moves.filter(m => m.row === -1)).toHaveLength(2);
  });

  it('never offers off-board sky moves (negative column)', () => {
    const board = boardWith([stack('player', 3, 0, 0)]);
    const moves = getValidMoves(board, board[0][0]!);
    expect(moves.some(m => m.row === -1 && m.col < 0)).toBe(false);
    expect(moves.some(m => m.col < 0 || m.col >= BOARD_COLS)).toBe(false);
  });

  it('offers no sky moves for stacks not in the top row', () => {
    const board = boardWith([stack('player', 3, 1, 2)]);
    const moves = getValidMoves(board, board[1][2]!);
    expect(moves.some(m => m.row === -1)).toBe(false);
  });
});

describe('moveStack validation', () => {
  it('rejects a move that is not in validMoves', () => {
    const board = boardWith([
      stack('player', 1, 5, 0),
      stack('bear', 6, 0, 1),
      stack('bear', 6, 5, 2),
    ]);
    const state = makeState({ board, selectedStackId: 'player-0', validMoves: [] });
    expect(moveStack(state, { row: 2, col: 3 })).toBe(state);
  });

  it('rejects a sky move that is not in validMoves (no bypass)', () => {
    const board = boardWith([
      stack('player', 1, 0, 0),
      stack('bear', 6, 0, 1),
      stack('bear', 6, 5, 2),
    ]);
    const state = makeState({ board, selectedStackId: 'player-0', validMoves: [] });
    const result = moveStack(state, { row: -1, col: 1 });
    expect(result).toBe(state);
    expect(state.board[0][0]).not.toBeNull();
  });
});

describe('sky move', () => {
  it('moves pieces to the sky and completes the bear turn (blank dice)', () => {
    setRandomSource(() => face(6)); // every bear die is blank
    const board = boardWith([
      stack('player', 2, 0, 1),
      stack('player', 5, 5, 4),
      stack('player', 5, 5, 1),
      stack('bear', 4, 0, 3),
      stack('bear', 3, 5, 0),
    ]);
    const selected = selectStack(makeState({ board, bearPiecesInCave: 5 }), 'player-0');
    const state = moveStack(selected, { row: -1, col: 0 });
    expect(state.playerPiecesInSky).toBe(2);
    expect(state.board[0][1]).toBeNull();
    // The bear's dice are blank here, so the turn completes immediately.
    expect(state.currentTurn).toBe('player');
    expect(auditGameState(state).isValid).toBe(true);
  });

  it('ends the game with a win when the last piece makes the sky count 10+', () => {
    setRandomSource(() => face(6));
    const board = boardWith([
      stack('player', 1, 0, 0),
      stack('bear', 5, 0, 2),
      stack('bear', 5, 0, 4),
    ]);
    const selected = selectStack(
      makeState({ board, playerPiecesInSky: 9, playerPiecesInPit: 2, bearPiecesInCave: 2 }),
      'player-0',
    );
    const state = moveStack(selected, { row: -1, col: 1 });
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('player');
    expect(state.playerPiecesInSky).toBe(10);
    // The game ends immediately; the pre-existing log is preserved.
    expect(state.bearLog).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bear turn mechanics
// ---------------------------------------------------------------------------

describe('bear turn', () => {
  it('spawning from the cave onto a player stack captures one-for-one (no vanishing pieces)', () => {
    // Die 1 -> column 0. Player stack at (0,0) h3; cave holds 2.
    setRandomSource(() => face(1));
    const board = boardWith([
      stack('player', 3, 0, 0),
      stack('player', 2, 5, 0),
      stack('player', 5, 5, 4),
      stack('player', 1, 5, 2),
      stack('player', 1, 5, 3),
      stack('bear', 5, 0, 1),
      stack('bear', 5, 2, 1),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 2 }), 'player-4'));
    expect(result.currentTurn).toBe('player');
    // Pairs: 2. Player keeps 1 at (0,0); 2 go to the pit; 2 bear pieces return to the cave.
    expect(result.board[0][0]?.player).toBe('player');
    expect(result.board[0][0]?.pieces).toBe(1);
    expect(result.playerPiecesInPit).toBe(2);
    expect(result.bearPiecesInCave).toBe(2);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('spawning from the cave onto an empty top-row cell places a new stack', () => {
    // Die 2 -> column 1 (no bear stack there); cave holds 6.
    setRandomSource(() => face(2));
    const board = boardWith([
      stack('player', 1, 5, 0),
      stack('player', 5, 5, 1),
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 4),
      stack('bear', 5, 0, 3),
      stack('bear', 1, 2, 0),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 6 }), 'player-0'));
    expect(result.board[0][1]?.player).toBe('bear');
    expect(result.board[0][1]?.pieces).toBe(5); // capped at 5 from a cave of 6
    expect(result.bearPiecesInCave).toBe(1);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('captures a player stack when moving down onto it', () => {
    // Player passes with the 2-stack at (5,2): bear rolls 2 dice: 1 (capture), 6 (blank).
    const rolls: number[] = [face(1), face(6)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 5, 1, 0),
      stack('player', 2, 5, 2),
      stack('player', 5, 5, 3),
      stack('bear', 2, 0, 0),
      stack('bear', 5, 0, 4),
    ]);
    const state = makeState({ board, bearPiecesInCave: 5 });
    const result = finishBearTurn(passTurn(state, 'player-1'));
    expect(result.board[1][0]?.player).toBe('player');
    expect(result.board[1][0]?.pieces).toBe(3); // 5 vs 2 -> 3 remain
    expect(result.playerPiecesInPit).toBe(2);
    expect(result.bearPiecesInCave).toBe(5 + 2);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('merges bear stacks without a height limit', () => {
    const rolls: number[] = [face(1)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 5, 0),
      stack('bear', 4, 0, 0),
      stack('bear', 3, 1, 0),
      stack('bear', 5, 0, 3),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board }), 'player-0'));
    expect(result.board[1][0]?.player).toBe('bear');
    expect(result.board[1][0]?.pieces).toBe(7); // merged 4 + 3, no height limit
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('moves a bottom-row bear stack to the ground and rains it back', () => {
    // Die 1 sends bear (5,0) h2 to the ground; rain rolls 3, 3 rebuild a stack in column 2.
    const rolls: number[] = [face(1), face(3), face(3)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 4, 0),
      stack('bear', 2, 5, 0),
      stack('bear', 5, 0, 3),
    ]);
    const state = passTurn(makeState({ board, bearPiecesInCave: 5 }), 'player-0');
    const result = finishBearTurn(state);
    expect(result.bearPiecesOnGround).toBe(0);
    expect(result.board[0][2]?.player).toBe('bear');
    expect(result.board[0][2]?.pieces).toBe(2); // one piece per rain-back roll
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('sends rain-back pieces to the cave on a roll of 6', () => {
    const rolls: number[] = [face(1), face(6), face(6)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 4, 0),
      stack('bear', 2, 5, 0),
      stack('bear', 5, 0, 3),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 5 }), 'player-0'));
    expect(result.bearPiecesOnGround).toBe(0);
    expect(result.bearPiecesInCave).toBe(7);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('sends rain-back pieces to the cave when the column stack is full', () => {
    // Die 1 sends bear (5,0) h1 to the ground; rain roll 2 hits the full stack in column 1.
    const rolls: number[] = [face(1), face(2)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 4, 0),
      stack('bear', 1, 5, 0),
      stack('bear', 5, 0, 1),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 6 }), 'player-0'));
    expect(result.bearPiecesOnGround).toBe(0);
    expect(result.board[0][1]?.pieces).toBe(5); // untouched
    expect(result.bearPiecesInCave).toBe(7);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('rain-back pieces annihilate with player stacks one-for-one', () => {
    // Die 1 sends bear (5,0) h1 to the ground; rain roll 3 lands on the player stack in column 2.
    const rolls: number[] = [face(1), face(3)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 2, 0, 2),
      stack('player', 5, 5, 4),
      stack('player', 4, 5, 1),
      stack('player', 1, 5, 3),
      stack('bear', 1, 5, 0),
      stack('bear', 5, 0, 3),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 6 }), 'player-3'));
    expect(result.playerPiecesInPit).toBe(1);
    expect(result.board[0][2]?.player).toBe('player');
    expect(result.board[0][2]?.pieces).toBe(1);
    expect(result.bearPiecesInCave).toBe(7);
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('advances only the highest stack in a doubled column', () => {
    const rolls: number[] = [face(1)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 5, 0),
      stack('bear', 2, 0, 0),
      stack('bear', 2, 2, 0),
      stack('bear', 3, 4, 0),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 5 }), 'player-0'));
    // Highest (closest to sky) is row 0; it moves to row 1.
    expect(result.board[1][0]?.pieces).toBe(2);
    expect(result.board[2][0]?.pieces).toBe(2);
    expect(result.board[4][0]?.pieces).toBe(3);
    expect(auditGameState(result).isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshot playback integrity
// ---------------------------------------------------------------------------

describe('bear move queue playback', () => {
  it('replays by assigning pre-computed snapshots (no re-computation, no drift)', () => {
    // Two dice (1, 1) -> two bear steps, so the queue is non-empty.
    const rolls: number[] = [face(1), face(1)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 2, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('bear', 2, 0, 0),
    ]);
    const state = passTurn(makeState({ board, bearPiecesInCave: 10 }), 'player-0');
    expect(state.currentTurn).toBe('bear');
    expect(state.currentBearStep).not.toBeNull();
    expect(state.bearMoveQueue.length).toBeGreaterThan(0);

    const firstStepBoard = state.currentBearStep!.boardAfter;
    const replayed = processNextBearMove(state);
    expect(replayed.board).toBe(firstStepBoard); // assigned by reference
    expect(replayed.currentBearStep).toBe(state.bearMoveQueue[0]);
  });

  it('includes trailing blank rolls in the final log', () => {
    // Regression: dice sort ascending, so blank 6s come last - after the last
    // animated step - and were previously dropped from the replayed log.
    // Player passes with a 3-stack: bear rolls 3 dice -> [2, 4, 6].
    const rolls: number[] = [face(2), face(4), face(6)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 3, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 4, 5, 4),
      stack('bear', 2, 0, 1), // column 2: moves down
      stack('bear', 3, 1, 3), // column 4: moves down
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 7 }), 'player-0'));
    expect(result.currentTurn).toBe('player');
    expect(result.bearLog).toHaveLength(3);
    expect(result.bearLog[0]).toMatchObject({ roll: 2, action: 'Move Down' });
    expect(result.bearLog[1]).toMatchObject({ roll: 4, action: 'Move Down' });
    expect(result.bearLog[2]).toMatchObject({ roll: 6, action: 'Blank' });
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('ends the bear turn in the same call that applies the last step', () => {
    // Regression: the UI calls processNextBearMove exactly once per animated
    // step; a single-step bear turn must return to the player without a
    // dangling 'bear' turn state.
    const rolls: number[] = [face(1)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 5, 0),
      stack('bear', 3, 0, 0),
    ]);
    const state = passTurn(makeState({ board, bearPiecesInCave: 9 }), 'player-0');
    expect(state.currentTurn).toBe('bear');
    expect(state.bearMoveQueue).toHaveLength(0); // exactly one step

    const result = processNextBearMove(state);
    expect(result.currentTurn).toBe('player');
    expect(result.currentBearStep).toBeNull();
    expect(auditGameState(result).isValid).toBe(true);
  });

  it('ends the bear turn cleanly once the queue is exhausted', () => {
    const rolls: number[] = [face(1)];
    setRandomSource(() => rolls.shift()!);
    const board = boardWith([
      stack('player', 1, 5, 2),
      stack('player', 5, 5, 1),
      stack('player', 5, 5, 4),
      stack('player', 1, 5, 0),
      stack('bear', 3, 0, 0),
    ]);
    const result = finishBearTurn(passTurn(makeState({ board, bearPiecesInCave: 9 }), 'player-0'));
    expect(result.currentTurn).toBe('player');
    expect(result.currentBearStep).toBeNull();
    expect(result.bearMoveQueue).toHaveLength(0);
    expect(auditGameState(result).isValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Randomized soak test: piece conservation across whole random games
// ---------------------------------------------------------------------------

describe('random game soak', () => {
  it('keeps the audit valid at every step of 50 random games', () => {
    for (let game = 0; game < 50; game++) {
      let state = createInitialState();
      let turns = 0;

      while (!state.gameOver && turns < 300) {
        turns++;
        // Player: pick a random stack and a random valid move (or pass).
        const playerStacks = state.board.flat().filter((s): s is Stack => s?.player === 'player');
        if (playerStacks.length === 0) break;
        const chosen = playerStacks[Math.floor(Math.random() * playerStacks.length)]!;
        state = selectStack(state, chosen.id);
        if (state.validMoves.length > 0 && Math.random() < 0.9) {
          const target = state.validMoves[Math.floor(Math.random() * state.validMoves.length)]!;
          state = moveStack(state, target);
        } else {
          state = passTurn(state, chosen.id);
        }
        state = finishBearTurn(state);
        const audit = auditGameState(state);
        if (!audit.isValid) {
          throw new Error(`game ${game}, turn ${turns}: ${audit.message}`);
        }
      }

      expect(auditGameState(state).isValid).toBe(true);
      if (state.gameOver) {
        // Winner must be consistent with the sky count at game end.
        expect(state.playerPiecesInSky >= 10).toBe(state.winner === 'player');
      }
    }
  });
});