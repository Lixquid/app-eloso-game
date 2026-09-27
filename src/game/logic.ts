import {
  BOARD_ROWS,
  BOARD_COLS,
  MAX_STACK_HEIGHT,
  PLAYER_START_ROW,
  BEAR_START_ROW,
  WIN_THRESHOLD,
  TOTAL_PIECES_PER_SIDE,
  type GameState,
  type Stack,
  type Position,
  type Player,
  type Board,
  type Cell,
  type BearLogEntry,
  type BearMove,
  type AuditResult,
  createEmptyBoard,
} from '../types/game';
import { rollDie, rollDice } from './utils';

function createStack(player: Player, pieces: number, position: Position): Stack {
  return {
    id: `${player}-${crypto.randomUUID()}`,
    player,
    pieces,
    position,
  };
}

function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

function findStack(board: Board, stackId: string): Stack | null {
  for (const row of board) {
    for (const stack of row) {
      if (stack && stack.id === stackId) return stack;
    }
  }
  return null;
}

function getStackAt(board: Board, pos: Position): Cell {
  if (pos.row < 0 || pos.row >= BOARD_ROWS || pos.col < 0 || pos.col >= BOARD_COLS) return null;
  return board[pos.row][pos.col];
}

function countPiecesOnBoard(board: Board, player: Player): number {
  let count = 0;
  for (const row of board) {
    for (const stack of row) {
      if (stack && stack.player === player) count += stack.pieces;
    }
  }
  return count;
}

/**
 * Pair off opposing pieces one by one until one side runs out.
 * Pure: never mutates its inputs.
 */
function resolveCapture(playerPieces: number, bearPieces: number): {
  remainingPlayer: number;
  remainingBear: number;
  playerRemoved: number;
  bearRemoved: number;
} {
  const pairs = Math.min(playerPieces, bearPieces);
  return {
    remainingPlayer: playerPieces - pairs,
    remainingBear: bearPieces - pairs,
    playerRemoved: pairs,
    bearRemoved: pairs,
  };
}

/**
 * Place the result of a capture onto a cell. If the player stack survives it
 * stays (reduced); if the bear stack survives a new bear stack is created;
 * if both annihilate the cell is emptied. Pure with respect to the input
 * stack objects (always creates new objects).
 */
function captureCell(
  target: Stack,
  bearPieces: number,
  position: Position,
): { cell: Cell; playerRemoved: number; bearRemoved: number } {
  const result = resolveCapture(target.pieces, bearPieces);
  let cell: Cell;
  if (result.remainingPlayer > 0) {
    cell = { ...target, pieces: result.remainingPlayer };
  } else if (result.remainingBear > 0) {
    cell = createStack('bear', result.remainingBear, position);
  } else {
    cell = null;
  }
  return { cell, playerRemoved: result.playerRemoved, bearRemoved: result.bearRemoved };
}

// ---------------------------------------------------------------------------
// State audit
// ---------------------------------------------------------------------------

export function auditGameState(state: GameState): AuditResult {
  const playerOnBoard = countPiecesOnBoard(state.board, 'player');
  const bearOnBoard = countPiecesOnBoard(state.board, 'bear');

  const playerTotal = playerOnBoard + state.playerPiecesInSky + state.playerPiecesInPit;
  const bearTotal = bearOnBoard + state.bearPiecesInCave + state.bearPiecesOnGround;

  if (playerTotal !== TOTAL_PIECES_PER_SIDE) {
    return {
      isValid: false,
      message: `Player piece count mismatch: ${playerTotal}/${TOTAL_PIECES_PER_SIDE} (board: ${playerOnBoard}, sky: ${state.playerPiecesInSky}, pit: ${state.playerPiecesInPit})`,
    };
  }

  if (bearTotal !== TOTAL_PIECES_PER_SIDE) {
    return {
      isValid: false,
      message: `Bear piece count mismatch: ${bearTotal}/${TOTAL_PIECES_PER_SIDE} (board: ${bearOnBoard}, cave: ${state.bearPiecesInCave}, ground: ${state.bearPiecesOnGround})`,
    };
  }

  return { isValid: true, message: 'OK' };
}

// ---------------------------------------------------------------------------
// Player turn
// ---------------------------------------------------------------------------

export function getValidMoves(board: Board, stack: Stack): Position[] {
  const moves: Position[] = [];
  const maxDist = stack.pieces;
  const { row, col } = stack.position;

  // Directions: up-left, up-right, left, right, down-left, down-right (no straight forward/back)
  const directions: [number, number][] = [
    [-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1],
  ];

  for (const [dRow, dCol] of directions) {
    for (let dist = 1; dist <= maxDist; dist++) {
      const newRow = row + dRow * dist;
      const newCol = col + dCol * dist;

      // Column must stay on the board in every direction.
      if (newCol < 0 || newCol >= BOARD_COLS) break;

      // Moving off top of board (to Sky) - only from the top row, diagonally, one step.
      if (newRow < 0) {
        if (row === 0 && dRow === -1 && dist === 1) {
          moves.push({ row: -1, col: newCol });
        }
        break;
      }

      if (newRow >= BOARD_ROWS) break;

      // Stacks move step by step along the path; any occupied cell blocks it.
      if (getStackAt(board, { row: newRow, col: newCol }) !== null) break;

      moves.push({ row: newRow, col: newCol });
    }
  }

  return moves;
}

export function createInitialState(): GameState {
  const board = createEmptyBoard();

  // Total pieces per side: 12 (based on win conditions: 10=win, 11-12=superior)
  // Place 1 piece in each of the 5 columns = 5 pieces
  // Then randomly distribute remaining 7 pieces
  const INITIAL_PIECES = BOARD_COLS; // 5 pieces (one per column)
  const REMAINING_PIECES = TOTAL_PIECES_PER_SIDE - INITIAL_PIECES; // 7 pieces

  // Place 1 piece in each column for both player and bear
  for (let col = 0; col < BOARD_COLS; col++) {
    board[PLAYER_START_ROW][col] = createStack('player', 1, { row: PLAYER_START_ROW, col });
    board[BEAR_START_ROW][col] = createStack('bear', 1, { row: BEAR_START_ROW, col });
  }

  // Place remaining pieces: roll a die per piece; a roll of 6 is re-rolled and
  // stacks never exceed MAX_STACK_HEIGHT (the die is simply rolled again).
  const distribute = (row: number, remaining: number) => {
    while (remaining > 0) {
      const roll = rollDie();
      if (roll === 6) continue;
      const col = roll - 1;
      const stack = board[row][col];
      if (stack && stack.pieces < MAX_STACK_HEIGHT) {
        board[row][col] = { ...stack, pieces: stack.pieces + 1 };
        remaining--;
      }
    }
  };

  distribute(PLAYER_START_ROW, REMAINING_PIECES);
  distribute(BEAR_START_ROW, REMAINING_PIECES);

  return {
    board,
    playerPiecesInSky: 0,
    playerPiecesInPit: 0,
    bearPiecesInCave: 0,
    bearPiecesOnGround: 0,
    currentTurn: 'player',
    selectedStackId: null,
    validMoves: [],
    gameOver: false,
    winner: null,
    message: 'Your turn. Select a stack to move.',
    lastPlayerMove: null,
    bearLog: [],
    currentBearStep: null,
    bearMoveQueue: [],
  };
}

export function selectStack(state: GameState, stackId: string | null): GameState {
  if (!stackId) {
    return { ...state, selectedStackId: null, validMoves: [] };
  }

  const stack = findStack(state.board, stackId);
  if (!stack || stack.player !== 'player') {
    return { ...state, selectedStackId: null, validMoves: [] };
  }

  const validMoves = getValidMoves(state.board, stack);

  return {
    ...state,
    selectedStackId: stackId,
    validMoves,
    message: validMoves.length > 0
      ? 'Select a destination (or click the stack again to pass)'
      : 'No valid moves. Click the stack again to pass.',
  };
}

export function moveStack(state: GameState, targetPos: Position): GameState {
  if (state.currentTurn !== 'player' || !state.selectedStackId || state.gameOver) {
    return state;
  }

  const stack = findStack(state.board, state.selectedStackId);
  if (!stack) return state;

  const { row: fromRow, col: fromCol } = stack.position;
  const { row: toRow, col: toCol } = targetPos;

  const isPass = toRow === fromRow && toCol === fromCol;
  // Sky moves are ordinary entries in validMoves ({row: -1, col}) and must be
  // validated like any other move.
  const isValidMove = state.validMoves.some(m => m.row === toRow && m.col === toCol);
  if (!isPass && !isValidMove) return state;

  const isSkyMove = toRow === -1;
  const newBoard = cloneBoard(state.board);
  newBoard[fromRow][fromCol] = null;

  let newPlayerPiecesInSky = state.playerPiecesInSky;
  let newMessage: string;

  if (isPass) {
    newBoard[fromRow][fromCol] = stack;
    newMessage = `You passed. Bear's turn...`;
  } else if (isSkyMove) {
    newPlayerPiecesInSky += stack.pieces;
    newMessage = `Moved ${stack.pieces} piece(s) to the Sky! Bear's turn...`;
  } else {
    newBoard[toRow][toCol] = { ...stack, position: { row: toRow, col: toCol } };
    newMessage = `Moved stack of ${stack.pieces}. Bear's turn...`;
  }

  const lastPlayerMove = { stackId: state.selectedStackId, height: stack.pieces };

  // When the player's last piece leaves the board the game is over immediately.
  if (countPiecesOnBoard(newBoard, 'player') === 0) {
    const isWin = newPlayerPiecesInSky >= WIN_THRESHOLD;
    return {
      ...state,
      board: newBoard,
      playerPiecesInSky: newPlayerPiecesInSky,
      currentTurn: 'player',
      selectedStackId: null,
      validMoves: [],
      gameOver: true,
      winner: isWin ? 'player' : 'bear',
      message: isWin
        ? `Victory! ${newPlayerPiecesInSky} pieces reached the Sky!`
        : `Game over. ${newPlayerPiecesInSky} pieces reached the Sky.`,
      lastPlayerMove,
      currentBearStep: null,
      bearMoveQueue: [],
    };
  }

  // Execute bear turn
  return executeBearTurn({
    ...state,
    board: newBoard,
    playerPiecesInSky: newPlayerPiecesInSky,
    currentTurn: 'bear',
    selectedStackId: null,
    validMoves: [],
    lastPlayerMove,
    message: newMessage,
  });
}

// ---------------------------------------------------------------------------
// Bear turn: simulated up-front, replayed from snapshots
// ---------------------------------------------------------------------------

/**
 * Mutable simulation state for building the bear's turn. The board starts as
 * a shallow clone of the real board; the discipline is that Stack objects are
 * NEVER mutated in place - every change creates a new Stack object, so the
 * caller's board is never affected.
 */
interface SimState {
  board: Board;
  cave: number;
  ground: number;
  pit: number;
  log: BearLogEntry[];
  steps: BearMove[];
}

function pushStep(sim: SimState, move: Pick<BearMove, 'stack' | 'from' | 'to' | 'action'>): void {
  sim.steps.push({
    ...move,
    boardAfter: cloneBoard(sim.board),
    resourcesAfter: { cave: sim.cave, ground: sim.ground, pit: sim.pit },
    logSoFar: [...sim.log],
  });
}

function bearStacksInColumn(board: Board, col: number): { stack: Stack; row: number }[] {
  const stacks: { stack: Stack; row: number }[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const cell = board[r][col];
    if (cell && cell.player === 'bear') {
      stacks.push({ stack: cell, row: r });
    }
  }
  return stacks;
}

/** Apply one (non-blank) bear die to the simulation. */
function applyBearDie(sim: SimState, roll: number): void {
  const col = roll - 1;
  const bearStacks = bearStacksInColumn(sim.board, col);

  if (bearStacks.length === 0) {
    // Empty column of the Bear's: spawn a new stack from the Cave.
    if (sim.cave === 0) {
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Blank',
        details: 'Empty column but Cave is empty',
      });
      return;
    }

    const piecesToAdd = Math.min(MAX_STACK_HEIGHT, sim.cave);
    sim.cave -= piecesToAdd;
    const pos: Position = { row: BEAR_START_ROW, col };
    const playerTarget = sim.board[BEAR_START_ROW][col];

    if (playerTarget && playerTarget.player === 'player') {
      // The spawned pieces land on a player stack: annihilate one-for-one.
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Cave → Board',
        details: `Placed ${piecesToAdd} bear piece(s) from Cave`,
      });
      const { cell, playerRemoved, bearRemoved } = captureCell(playerTarget, piecesToAdd, pos);
      sim.pit += playerRemoved;
      sim.cave += bearRemoved;
      sim.board[BEAR_START_ROW][col] = cell;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Capture',
        details: `Bear (${piecesToAdd}) captured Player (${playerTarget.pieces}) → Player loses ${playerRemoved}, Bear loses ${bearRemoved}`,
      });
      pushStep(sim, {
        stack: createStack('bear', piecesToAdd, pos),
        from: { row: -1, col },
        to: pos,
        action: 'capture',
      });
    } else {
      const newStack = createStack('bear', piecesToAdd, pos);
      sim.board[BEAR_START_ROW][col] = newStack;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Cave → Board',
        details: `Placed ${piecesToAdd} bear piece(s) from Cave`,
      });
      pushStep(sim, {
        stack: newStack,
        from: { row: -1, col },
        to: pos,
        action: 'cave-to-board',
      });
    }
    return;
  }

  // Basic/Double column: advance only the highest stack (closest to the Sky).
  const highest = bearStacks.reduce((h, c) => (c.row < h.row ? c : h));
  sim.board[highest.row][col] = null;

  if (highest.row === BOARD_ROWS - 1) {
    // Moving off the bottom to the Ground.
    sim.ground += highest.stack.pieces;
    sim.log.push({
      roll,
      column: col + 1,
      action: 'Move to Ground',
      details: `Bear stack (${highest.stack.pieces}) moved off board to Ground`,
    });
    pushStep(sim, {
      stack: highest.stack,
      from: { row: highest.row, col },
      to: { row: BOARD_ROWS, col },
      action: 'move-to-ground',
    });
    return;
  }

  const toRow = highest.row + 1;
  const target = sim.board[toRow][col];
  const to: Position = { row: toRow, col };

  if (target && target.player === 'player') {
    // Capture.
    const { cell, playerRemoved, bearRemoved } = captureCell(target, highest.stack.pieces, to);
    sim.pit += playerRemoved;
    sim.cave += bearRemoved;
    sim.board[toRow][col] = cell;
    sim.log.push({
      roll,
      column: col + 1,
      action: 'Capture',
      details: `Bear (${highest.stack.pieces}) captured Player (${target.pieces}) → Player loses ${playerRemoved}, Bear loses ${bearRemoved}`,
    });
    pushStep(sim, {
      stack: highest.stack,
      from: { row: highest.row, col },
      to,
      action: 'capture',
    });
  } else if (target && target.player === 'bear') {
    // Merge - no height limit when bear stacks merge.
    sim.board[toRow][col] = { ...target, pieces: target.pieces + highest.stack.pieces };
    sim.log.push({
      roll,
      column: col + 1,
      action: 'Merge',
      details: `Bear stack (${highest.stack.pieces}) merged into bear stack at row ${toRow} (now ${target.pieces + highest.stack.pieces})`,
    });
    pushStep(sim, {
      stack: highest.stack,
      from: { row: highest.row, col },
      to,
      action: 'merge',
    });
  } else {
    // Empty cell: plain move down one.
    sim.board[toRow][col] = { ...highest.stack, position: to };
    sim.log.push({
      roll,
      column: col + 1,
      action: 'Move Down',
      details: `Bear stack (${highest.stack.pieces}) moved down one space`,
    });
    pushStep(sim, {
      stack: highest.stack,
      from: { row: highest.row, col },
      to,
      action: 'move',
    });
  }
}

/**
 * Rain ground pieces back onto the top row: one die roll per piece.
 * A roll of 6, or a roll onto a full bear stack, sends the piece to the Cave.
 * Rain pieces landing on a player stack annihilate one-for-one.
 */
function rainBack(sim: SimState): void {
  sim.log.push({
    roll: -1,
    column: -1,
    action: 'Rain Back',
    details: `Rain back ${sim.ground} piece(s) from Ground`,
  });

  while (sim.ground > 0) {
    const roll = rollDie();

    if (roll === 6) {
      sim.ground--;
      sim.cave++;
      sim.log.push({
        roll,
        column: -1,
        action: 'Rain Back → Cave',
        details: 'Roll of 6 sent to Cave',
      });
      pushStep(sim, {
        stack: createStack('bear', 1, { row: BEAR_START_ROW, col: 0 }),
        from: { row: BOARD_ROWS, col: 0 },
        to: { row: -1, col: 0 },
        action: 'rain-back-cave',
      });
      continue;
    }

    const col = roll - 1;
    const target = sim.board[BEAR_START_ROW][col];

    if (target && target.player === 'bear' && target.pieces >= MAX_STACK_HEIGHT) {
      // Stack would exceed the height limit -> piece goes to the Cave.
      sim.ground--;
      sim.cave++;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Cave',
        details: `Column ${col + 1} full (${MAX_STACK_HEIGHT}), piece sent to Cave`,
      });
      pushStep(sim, {
        stack: createStack('bear', 1, { row: BEAR_START_ROW, col }),
        from: { row: BOARD_ROWS, col },
        to: { row: -1, col },
        action: 'rain-back-cave',
      });
    } else if (target && target.player === 'bear') {
      sim.board[BEAR_START_ROW][col] = { ...target, pieces: target.pieces + 1 };
      sim.ground--;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Board',
        details: `Added 1 piece to bear stack in column ${col + 1} (now ${target.pieces + 1})`,
      });
      pushStep(sim, {
        stack: createStack('bear', 1, { row: BEAR_START_ROW, col }),
        from: { row: BOARD_ROWS, col },
        to: { row: BEAR_START_ROW, col },
        action: 'rain-back',
      });
    } else if (target && target.player === 'player') {
      // Rain piece lands on a player stack: one-for-one annihilation.
      const { cell, playerRemoved, bearRemoved } = captureCell(target, 1, { row: BEAR_START_ROW, col });
      sim.pit += playerRemoved;
      sim.cave += bearRemoved;
      sim.ground--;
      sim.board[BEAR_START_ROW][col] = cell;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Rain Back Capture',
        details: `Rain piece captured Player (${target.pieces}) → Player loses ${playerRemoved}, Bear loses ${bearRemoved}`,
      });
      pushStep(sim, {
        stack: createStack('bear', 1, { row: BEAR_START_ROW, col }),
        from: { row: BOARD_ROWS, col },
        to: { row: BEAR_START_ROW, col },
        action: 'rain-back-capture',
      });
    } else {
      sim.board[BEAR_START_ROW][col] = createStack('bear', 1, { row: BEAR_START_ROW, col });
      sim.ground--;
      sim.log.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Board',
        details: `Placed 1 new bear piece in column ${col + 1}`,
      });
      pushStep(sim, {
        stack: createStack('bear', 1, { row: BEAR_START_ROW, col }),
        from: { row: BOARD_ROWS, col },
        to: { row: BEAR_START_ROW, col },
        action: 'rain-back',
      });
    }
  }
}

/**
 * Simulate the bear's entire turn and return a state whose board is still the
 * post-player-move board; the first step is exposed as currentBearStep and the
 * rest as bearMoveQueue. Playback (processNextBearMove) only ever assigns the
 * pre-computed snapshots, so it cannot drift from the simulation.
 */
function executeBearTurn(state: GameState): GameState {
  if (!state.lastPlayerMove) return endBearTurn(state);

  const diceCount = state.lastPlayerMove.height;
  const rolls = rollDice(diceCount).sort((a, b) => a - b);

  const sim: SimState = {
    board: cloneBoard(state.board),
    cave: state.bearPiecesInCave,
    ground: state.bearPiecesOnGround,
    pit: state.playerPiecesInPit,
    log: [...state.bearLog],
    steps: [],
  };

  for (const roll of rolls) {
    if (roll === 6) {
      sim.log.push({
        roll,
        column: -1,
        action: 'Blank',
        details: 'Roll of 6 is blank',
      });
      continue; // Blank
    }
    applyBearDie(sim, roll);
  }

  // Rain back pieces from the Ground after all dice are executed.
  if (sim.ground > 0) {
    rainBack(sim);
  }

  if (sim.steps.length === 0) {
    // Nothing to animate; finish the turn immediately with the final resources.
    return endBearTurn({
      ...state,
      bearPiecesInCave: sim.cave,
      bearPiecesOnGround: sim.ground,
      playerPiecesInPit: sim.pit,
      bearLog: sim.log,
      currentBearStep: null,
      bearMoveQueue: [],
    });
  }

  // Log-only entries that occur after the last animated step (e.g. trailing
  // blank 6s, which always sort last) would otherwise be dropped during
  // playback, since each step replays its own logSoFar snapshot. Make the
  // final step carry the complete log.
  sim.steps[sim.steps.length - 1].logSoFar = [...sim.log];

  return {
    ...state,
    board: state.board,
    bearPiecesInCave: state.bearPiecesInCave,
    bearPiecesOnGround: state.bearPiecesOnGround,
    playerPiecesInPit: state.playerPiecesInPit,
    bearLog: [...state.bearLog],
    currentBearStep: sim.steps[0],
    bearMoveQueue: sim.steps.slice(1),
  };
}

/**
 * Apply the step that just finished animating. This only assigns pre-computed
 * snapshots - no game logic runs here. If the applied step was the last one,
 * the bear's turn ends in the same call (the UI invokes this exactly once per
 * animated step, so the turn must not be left dangling between steps).
 */
export function processNextBearMove(state: GameState): GameState {
  const step = state.currentBearStep;
  if (!step) return endBearTurn(state);

  const queue = state.bearMoveQueue;
  const next = queue.length > 0 ? queue[0] : null;

  const applied: GameState = {
    ...state,
    board: step.boardAfter,
    bearPiecesInCave: step.resourcesAfter.cave,
    bearPiecesOnGround: step.resourcesAfter.ground,
    playerPiecesInPit: step.resourcesAfter.pit,
    bearLog: step.logSoFar,
    currentBearStep: next,
    bearMoveQueue: next ? queue.slice(1) : [],
  };

  return next ? applied : endBearTurn(applied);
}

function endBearTurn(state: GameState): GameState {
  const playerPiecesOnBoard = countPiecesOnBoard(state.board, 'player');

  if (playerPiecesOnBoard === 0) {
    // No pieces left on board - game over
    return {
      ...state,
      currentTurn: 'player',
      currentBearStep: null,
      bearMoveQueue: [],
      gameOver: true,
      winner: state.playerPiecesInSky >= WIN_THRESHOLD ? 'player' : 'bear',
      message: state.playerPiecesInSky >= WIN_THRESHOLD
        ? `Victory! ${state.playerPiecesInSky} pieces in the Sky!`
        : `Game over. ${state.playerPiecesInSky} pieces reached the Sky.`,
    };
  }

  // Audit game state at start of player's turn
  const audit = auditGameState(state);
  if (!audit.isValid) {
    console.error('GAME AUDIT FAILED:', audit.message);
  }

  return {
    ...state,
    currentTurn: 'player',
    currentBearStep: null,
    bearMoveQueue: [],
    message: 'Your turn. Select a stack to move.',
  };
}