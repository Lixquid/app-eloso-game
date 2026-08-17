import { 
  BOARD_ROWS, 
  BOARD_COLS, 
  MAX_STACK_HEIGHT, 
  PLAYER_START_ROW, 
  BEAR_START_ROW,
  WIN_THRESHOLD,
  type GameState, 
  type Stack, 
  type Position, 
  type Player,
  type BearLogEntry,
  createEmptyBoard 
} from '../types/game';

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function rollDice(count: number): number[] {
  return Array.from({ length: count }, () => rollDie());
}

function createStack(player: Player, pieces: number, position: Position): Stack {
  return {
    id: `${player}-${position.row}-${position.col}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    player,
    pieces,
    position,
  };
}

function findStack(board: (Stack | null)[][], stackId: string): Stack | null {
  for (const row of board) {
    for (const stack of row) {
      if (stack && stack.id === stackId) return stack;
    }
  }
  return null;
}

function getStackAt(board: (Stack | null)[][], pos: Position): Stack | null {
  if (pos.row < 0 || pos.row >= BOARD_ROWS || pos.col < 0 || pos.col >= BOARD_COLS) return null;
  return board[pos.row][pos.col];
}

function isPathClear(board: (Stack | null)[][], from: Position, to: Position): boolean {
  const dRow = to.row - from.row;
  const dCol = to.col - from.col;
  
  const stepRow = dRow === 0 ? 0 : dRow > 0 ? 1 : -1;
  const stepCol = dCol === 0 ? 0 : dCol > 0 ? 1 : -1;
  
  let currentRow = from.row + stepRow;
  let currentCol = from.col + stepCol;
  
  while (currentRow !== to.row || currentCol !== to.col) {
    if (getStackAt(board, { row: currentRow, col: currentCol }) !== null) {
      return false;
    }
    currentRow += stepRow;
    currentCol += stepCol;
  }
  
  return true;
}

export function getValidMoves(board: (Stack | null)[][], stack: Stack): Position[] {
  const moves: Position[] = [];
  const maxDist = stack.pieces;
  const { row, col } = stack.position;
  
  // Directions: up-left, up-right, left, right, down-left, down-right (no straight forward/back)
  const directions: [number, number][] = [
    [-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1]
  ];
  
  for (const [dRow, dCol] of directions) {
    for (let dist = 1; dist <= maxDist; dist++) {
      const newRow = row + dRow * dist;
      const newCol = col + dCol * dist;
      
      // Moving off top of board (to Sky) - only from top row, diagonally
      if (newRow < 0) {
        if (row === 0 && dRow === -1 && dist === 1) {
          moves.push({ row: -1, col: newCol });
        }
        break;
      }
      
      if (newRow >= BOARD_ROWS || newCol < 0 || newCol >= BOARD_COLS) break;
      
      if (getStackAt(board, { row: newRow, col: newCol }) !== null) break;
      
      if (isPathClear(board, { row, col }, { row: newRow, col: newCol })) {
        moves.push({ row: newRow, col: newCol });
      } else {
        break;
      }
    }
  }
  
  return moves;
}

function countPlayerPieces(board: (Stack | null)[][]): number {
  let count = 0;
  for (const row of board) {
    for (const stack of row) {
      if (stack && stack.player === 'player') count += stack.pieces;
    }
  }
  return count;
}

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

export function createInitialState(): GameState {
  const board = createEmptyBoard();
  
  // Total pieces per side: 12 (based on win conditions: 10=win, 11-12=superior)
  // Place 1 piece in each of the 5 columns = 5 pieces
  // Then randomly distribute remaining 7 pieces
  const TOTAL_PIECES_PER_SIDE = 12;
  const INITIAL_PIECES = BOARD_COLS; // 5 pieces (one per column)
  const REMAINING_PIECES = TOTAL_PIECES_PER_SIDE - INITIAL_PIECES; // 7 pieces
  
  // Place 1 piece in each column for both player and bear
  for (let col = 0; col < BOARD_COLS; col++) {
    board[PLAYER_START_ROW][col] = createStack('player', 1, { row: PLAYER_START_ROW, col });
    board[BEAR_START_ROW][col] = createStack('bear', 1, { row: BEAR_START_ROW, col });
  }
  
  // Place remaining player pieces
  let playerRemaining = REMAINING_PIECES;
  while (playerRemaining > 0) {
    const roll = rollDie();
    if (roll === 6) continue;
    const col = roll - 1;
    const stack = board[PLAYER_START_ROW][col];
    if (stack && stack.pieces < MAX_STACK_HEIGHT) {
      stack.pieces++;
      playerRemaining--;
    }
  }
  
  // Place remaining bear pieces
  let bearRemaining = REMAINING_PIECES;
  while (bearRemaining > 0) {
    const roll = rollDie();
    if (roll === 6) continue;
    const col = roll - 1;
    const stack = board[BEAR_START_ROW][col];
    if (stack && stack.pieces < MAX_STACK_HEIGHT) {
      stack.pieces++;
      bearRemaining--;
    }
  }
  
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
  const isValidMove = state.validMoves.some(m => m.row === toRow && m.col === toCol);
  const isSkyMove = toRow === -1 && fromRow === 0;
  
  if (!isPass && !isValidMove && !isSkyMove) return state;

  const newBoard = state.board.map(row => [...row]);
  newBoard[fromRow][fromCol] = null;

  let newPlayerPiecesInSky = state.playerPiecesInSky;
  let newMessage = '';

  if (isPass) {
    newBoard[fromRow][fromCol] = stack;
    newMessage = `You passed. Bear's turn...`;
  } else if (isSkyMove) {
    newPlayerPiecesInSky += stack.pieces;
    newMessage = `Moved ${stack.pieces} piece(s) to the Sky! Bear's turn...`;
  } else {
    newBoard[toRow][toCol] = {
      ...stack,
      position: { row: toRow, col: toCol },
    };
    newMessage = `Moved stack of ${stack.pieces}. Bear's turn...`;
  }

  const lastPlayerMove = { stackId: state.selectedStackId!, height: stack.pieces };

  // Check if all player pieces have left the board
  const totalPlayerPieces = countPlayerPieces(newBoard);
  
  if (totalPlayerPieces === 0) {
    // No pieces left on board - game over
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
      bearLog: [],
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

function executeBearTurn(state: GameState): GameState {
  if (!state.lastPlayerMove) return endBearTurn(state);

  const diceCount = state.lastPlayerMove.height;
  const rolls = rollDice(diceCount).sort((a, b) => a - b);
  
  let newState = { 
    ...state, 
    board: state.board.map(row => [...row]),
    bearLog: [] as BearLogEntry[],
  };
  newState.message = `Bear rolls: ${rolls.join(', ')}`;

  for (const roll of rolls) {
    if (roll === 6) {
      newState.bearLog.push({
        roll,
        column: -1,
        action: 'Blank',
        details: 'Roll of 6 is blank',
      });
      continue; // Blank
    }
    
    const col = roll - 1;
    newState = executeBearMove(newState, col, roll);
  }

  // Rain back pieces from Ground
  if (newState.bearPiecesOnGround > 0) {
    newState = rainBack(newState);
  }

  return endBearTurn(newState);
}

function executeBearMove(state: GameState, col: number, roll: number): GameState {
  const newBoard = state.board.map(row => [...row]);
  let newBearPiecesInCave = state.bearPiecesInCave;
  let newBearPiecesOnGround = state.bearPiecesOnGround;
  let newPlayerPiecesInPit = state.playerPiecesInPit;
  const bearLog = [...state.bearLog];

  // Find bear stacks in this column
  const bearStacks: { stack: Stack; row: number }[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    if (newBoard[r][col] && newBoard[r][col]!.player === 'bear') {
      bearStacks.push({ stack: newBoard[r][col]!, row: r });
    }
  }

  if (bearStacks.length === 0) {
    // Empty column - add new bear stack from Cave
    if (newBearPiecesInCave > 0) {
      const piecesToAdd = Math.min(5, newBearPiecesInCave);
      newBearPiecesInCave -= piecesToAdd;
      
      const newStack = createStack('bear', piecesToAdd, { row: BEAR_START_ROW, col });
      newBoard[BEAR_START_ROW][col] = newStack;
      
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Cave → Board',
        details: `Placed ${piecesToAdd} bear piece(s) from Cave`,
      });
      
      // Check for capture with player stack
      const playerStack = newBoard[BEAR_START_ROW][col];
      if (playerStack && playerStack.player === 'player') {
        const result = resolveCapture(playerStack.pieces, piecesToAdd);
        newPlayerPiecesInPit += result.playerRemoved;
        newBearPiecesInCave += result.bearRemoved;
        
        if (result.remainingPlayer > 0) {
          newBoard[BEAR_START_ROW][col] = { ...playerStack, pieces: result.remainingPlayer };
        } else if (result.remainingBear > 0) {
          newBoard[BEAR_START_ROW][col] = createStack('bear', result.remainingBear, { row: BEAR_START_ROW, col });
        } else {
          newBoard[BEAR_START_ROW][col] = null;
        }
        
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Capture',
          details: `Bear (${piecesToAdd}) captured Player (${playerStack.pieces}) → Player loses ${result.playerRemoved}, Bear loses ${result.bearRemoved}`,
        });
      }
    } else {
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Blank',
        details: 'Empty column but Cave is empty',
      });
    }
  } else if (bearStacks.length === 1) {
    // Single stack - move it down one
    const { stack, row } = bearStacks[0];
    newBoard[row][col] = null;
    
    if (row === BOARD_ROWS - 1) {
      // Moving off bottom to Ground
      newBearPiecesOnGround += stack.pieces;
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Move to Ground',
        details: `Bear stack (${stack.pieces}) moved off board to Ground`,
      });
    } else {
      const toRow = row + 1;
      const target = newBoard[toRow][col];
      
      if (target && target.player === 'player') {
        // Capture player
        const result = resolveCapture(target.pieces, stack.pieces);
        newPlayerPiecesInPit += result.playerRemoved;
        newBearPiecesInCave += result.bearRemoved;
        
        if (result.remainingPlayer > 0) {
          newBoard[toRow][col] = { ...target, pieces: result.remainingPlayer };
        } else if (result.remainingBear > 0) {
          newBoard[toRow][col] = createStack('bear', result.remainingBear, { row: toRow, col });
        } else {
          newBoard[toRow][col] = null;
        }
        
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Capture',
          details: `Bear (${stack.pieces}) captured Player (${target.pieces}) → Player loses ${result.playerRemoved}, Bear loses ${result.bearRemoved}`,
        });
      } else if (target && target.player === 'bear') {
        // Merge with bear stack
        target.pieces += stack.pieces;
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Merge',
          details: `Bear stack (${stack.pieces}) merged into bear stack at row ${toRow} (now ${target.pieces})`,
        });
      } else {
        // Empty
        newBoard[toRow][col] = createStack('bear', stack.pieces, { row: toRow, col });
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Move Down',
          details: `Bear stack (${stack.pieces}) moved down one space`,
        });
      }
    }
  } else {
    // Multiple stacks - move only the highest (lowest row number)
    const highest = bearStacks.reduce((h, c) => c.row < h.row ? c : h);
    newBoard[highest.row][col] = null;
    
    if (highest.row === BOARD_ROWS - 1) {
      // Moving off bottom to Ground
      newBearPiecesOnGround += highest.stack.pieces;
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Move to Ground',
        details: `Highest bear stack (${highest.stack.pieces}) moved off board to Ground`,
      });
    } else {
      const toRow = highest.row + 1;
      const target = newBoard[toRow][col];
      
      if (target && target.player === 'player') {
        // Capture player
        const result = resolveCapture(target.pieces, highest.stack.pieces);
        newPlayerPiecesInPit += result.playerRemoved;
        newBearPiecesInCave += result.bearRemoved;
        
        if (result.remainingPlayer > 0) {
          newBoard[toRow][col] = { ...target, pieces: result.remainingPlayer };
        } else if (result.remainingBear > 0) {
          newBoard[toRow][col] = createStack('bear', result.remainingBear, { row: toRow, col });
        } else {
          newBoard[toRow][col] = null;
        }
        
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Capture',
          details: `Highest bear (${highest.stack.pieces}) captured Player (${target.pieces}) → Player loses ${result.playerRemoved}, Bear loses ${result.bearRemoved}`,
        });
      } else if (target && target.player === 'bear') {
        // Merge with bear stack
        target.pieces += highest.stack.pieces;
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Merge',
          details: `Highest bear stack (${highest.stack.pieces}) merged into bear stack at row ${toRow} (now ${target.pieces})`,
        });
      } else {
        // Empty
        newBoard[toRow][col] = createStack('bear', highest.stack.pieces, { row: toRow, col });
        bearLog.push({
          roll,
          column: col + 1,
          action: 'Move Down',
          details: `Highest bear stack (${highest.stack.pieces}) moved down one space`,
        });
      }
    }
  }

  // No global merge - merges only happen when a stack moves into another bear stack
  return {
    ...state,
    board: newBoard,
    bearPiecesInCave: newBearPiecesInCave,
    bearPiecesOnGround: newBearPiecesOnGround,
    playerPiecesInPit: newPlayerPiecesInPit,
    bearLog,
  };
}

function rainBack(state: GameState): GameState {
  const newBoard = state.board.map(row => [...row]);
  let pieces = state.bearPiecesOnGround;
  let newBearPiecesInCave = state.bearPiecesInCave;
  let newPlayerPiecesInPit = state.playerPiecesInPit;
  const bearLog = [...state.bearLog];

  bearLog.push({
    roll: -1,
    column: -1,
    action: 'Rain Back',
    details: `Rain back ${pieces} piece(s) from Ground`,
  });

  while (pieces > 0) {
    const roll = rollDie();
    
    if (roll === 6) {
      newBearPiecesInCave++;
      pieces--;
      bearLog.push({
        roll,
        column: -1,
        action: 'Rain Back → Cave',
        details: 'Roll of 6 sent to Cave',
      });
      continue;
    }

    const col = roll - 1;
    const target = newBoard[BEAR_START_ROW][col];

    if (target && target.player === 'bear' && target.pieces >= MAX_STACK_HEIGHT) {
      // Would exceed height limit -> Cave
      newBearPiecesInCave++;
      pieces--;
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Cave',
        details: `Column ${col + 1} full (5), piece sent to Cave`,
      });
      continue;
    }

    if (target && target.player === 'bear') {
      const space = MAX_STACK_HEIGHT - target.pieces;
      const toAdd = Math.min(space, pieces);
      target.pieces += toAdd;
      pieces -= toAdd;
      
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Board',
        details: `Added ${toAdd} piece(s) to bear stack in column ${col + 1} (now ${target.pieces})`,
      });
      
      if (pieces > 0) {
        newBearPiecesInCave += pieces;
        bearLog.push({
          roll: -1,
          column: -1,
          action: 'Rain Back → Cave',
          details: `Remaining ${pieces} piece(s) sent to Cave (column full)`,
        });
        pieces = 0;
      }
    } else if (target && target.player === 'player') {
      // Capture
      const piecesToAdd = Math.min(pieces, 5);
      const result = resolveCapture(target.pieces, piecesToAdd);
      newPlayerPiecesInPit += result.playerRemoved;
      newBearPiecesInCave += result.bearRemoved;
      pieces -= piecesToAdd;
      
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Rain Back Capture',
        details: `Rain pieces (${piecesToAdd}) captured Player (${target.pieces}) → Player loses ${result.playerRemoved}, Bear loses ${result.bearRemoved}`,
      });
      
      if (result.remainingPlayer > 0) {
        newBoard[BEAR_START_ROW][col] = { ...target, pieces: result.remainingPlayer };
      } else if (result.remainingBear > 0) {
        newBoard[BEAR_START_ROW][col] = createStack('bear', result.remainingBear, { row: BEAR_START_ROW, col });
      } else {
        newBoard[BEAR_START_ROW][col] = null;
      }
    } else {
      // Empty
      const piecesToAdd = Math.min(5, pieces);
      newBoard[BEAR_START_ROW][col] = createStack('bear', piecesToAdd, { row: BEAR_START_ROW, col });
      pieces -= piecesToAdd;
      
      bearLog.push({
        roll,
        column: col + 1,
        action: 'Rain Back → Board',
        details: `Placed ${piecesToAdd} new bear piece(s) in empty column ${col + 1}`,
      });
    }
  }

  return {
    ...state,
    board: newBoard,
    bearPiecesInCave: newBearPiecesInCave,
    bearPiecesOnGround: 0,
    playerPiecesInPit: newPlayerPiecesInPit,
    bearLog,
  };
}

function endBearTurn(state: GameState): GameState {
  const playerPiecesOnBoard = countPlayerPieces(state.board);
  
  if (playerPiecesOnBoard === 0) {
    // No pieces left on board - game over
    return {
      ...state,
      currentTurn: 'player',
      gameOver: true,
      winner: state.playerPiecesInSky >= WIN_THRESHOLD ? 'player' : 'bear',
      message: state.playerPiecesInSky >= WIN_THRESHOLD 
        ? `Victory! ${state.playerPiecesInSky} pieces in the Sky!`
        : `Game over. ${state.playerPiecesInSky} pieces reached the Sky.`,
    };
  }

  return {
    ...state,
    currentTurn: 'player',
    message: 'Your turn. Select a stack to move.',
  };
}