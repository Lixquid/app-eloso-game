import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../hooks/useGame';
import type { Stack, Position, AnimatingMove } from '../types/game';
import './Board.css';

const CELL_GAP = 4;
const BOARD_PADDING = 8;
const ANIMATION_DURATION = 300; // ms

interface BoardDimensions {
  cellSize: number;
  boardOffset: { x: number; y: number };
}

function getCellPixelPosition(row: number, col: number, dims: BoardDimensions): { x: number; y: number } {
  const x = dims.boardOffset.x + col * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  const y = dims.boardOffset.y + row * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  return { x, y };
}

function getSkyCellPixelPosition(col: number, dims: BoardDimensions): { x: number; y: number } {
  const x = dims.boardOffset.x + col * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  // Sky row is above the board element.
  // Board element has padding: 8px (BOARD_PADDING)
  // Sky row: height 40px, margin-bottom: 8px
  // Sky label: ~20px height (not in board element)
  // Sky piece: aligned to flex-end with padding-bottom: 8px, piece radius 10px
  // So piece center is at: -(sky-row-gap + board-padding + sky-piece-offset-from-bottom)
  // = -(8 + 8 + 8 + 10) = -34px from board padding box top
  const skyRowMarginBottom = 8;
  const skyPieceOffsetFromBottom = 8 + 10; // padding-bottom + piece radius
  const y = dims.boardOffset.y - skyRowMarginBottom - BOARD_PADDING - skyPieceOffsetFromBottom;
  return { x, y };
}

function getGroundCellPixelPosition(col: number, dims: BoardDimensions): { x: number; y: number } {
  const x = dims.boardOffset.x + col * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  // Ground row is below the board element.
  // Board has 6 rows (0-5), so ground is at row 6 (index 6)
  // Board padding: 8px, each cell: cellSize + gap
  const y = dims.boardOffset.y + 6 * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  return { x, y };
}

function getCaveCellPixelPosition(col: number, dims: BoardDimensions): { x: number; y: number } {
  // Cave is above the sky (off-screen top)
  const x = dims.boardOffset.x + col * (dims.cellSize + CELL_GAP) + dims.cellSize / 2;
  const skyRowMarginBottom = 8;
  const skyPieceOffsetFromBottom = 8 + 10;
  const y = dims.boardOffset.y - skyRowMarginBottom - BOARD_PADDING - skyPieceOffsetFromBottom - 50; // Extra offset for cave
  return { x, y };
}

interface AnimatingStackProps {
  stack: Stack;
  from: Position;
  to: Position;
  progress: number;
  dims: BoardDimensions;
}

function AnimatingStack({ stack, from, to, progress, dims }: AnimatingStackProps) {
  const isSkyMove = to.row === -1 && from.row >= 0 && from.row < 6;
  const isGroundMove = to.row === 6; // BOARD_ROWS = 6
  const isCaveMove = to.row === -1 && from.row === 6; // From ground to cave
  const isRainBackMove = from.row === 6 && to.row === 0; // From ground to board (BEAR_START_ROW)
  const isRainBackCaveMove = from.row === 6 && to.row === -1; // From ground to cave
  
  let currentX: number;
  let currentY: number;
  
  if (isSkyMove) {
    // Player moves to sky
    const fromPos = getCellPixelPosition(from.row, from.col, dims);
    const toPos = getSkyCellPixelPosition(to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  } else if (isGroundMove) {
    // Bear moves to ground
    const fromPos = getCellPixelPosition(from.row, from.col, dims);
    const toPos = getGroundCellPixelPosition(to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  } else if (isCaveMove) {
    // Bear moves from ground to cave (rain back cave)
    const fromPos = getGroundCellPixelPosition(from.col, dims);
    const toPos = getCaveCellPixelPosition(to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  } else if (isRainBackMove || isRainBackCaveMove) {
    // Rain back: pieces come from ground to board or cave
    const fromPos = getGroundCellPixelPosition(from.col, dims);
    const toPos = isRainBackMove 
      ? getCellPixelPosition(to.row, to.col, dims)
      : getCaveCellPixelPosition(to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  } else if (from.row === -1 && to.row === 0) {
    // Cave to board (bear spawns from cave)
    const fromPos = getCaveCellPixelPosition(from.col, dims);
    const toPos = getCellPixelPosition(to.row, to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  } else {
    // Regular board move
    const fromPos = getCellPixelPosition(from.row, from.col, dims);
    const toPos = getCellPixelPosition(to.row, to.col, dims);
    currentX = fromPos.x + (toPos.x - fromPos.x) * progress;
    currentY = fromPos.y + (toPos.y - fromPos.y) * progress;
  }

  const pieceColor = stack.player === 'player' 
    ? 'linear-gradient(135deg, #ffffff, #a0d4f8)'
    : 'linear-gradient(135deg, #ffcc00, #e67300)';

  return (
    <div
      className="animating-stack"
      style={{
        position: 'absolute',
        left: currentX,
        top: currentY,
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <div className="animating-stack-pieces" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Array.from({ length: Math.min(stack.pieces, 5) }).map((_, i) => (
          <div
            key={i}
            className={`piece ${stack.player}`}
            style={{ width: 28, height: 16, borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.4)', background: pieceColor }}
          />
        ))}
        {stack.pieces > 5 && (
          <div className="piece-count" style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ffd700', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            +{stack.pieces - 5}
          </div>
        )}
      </div>
      <div className="stack-height" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ffd700', textShadow: '0 1px 2px rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.5)', padding: '1px 6px', borderRadius: 4 }}>
        {stack.pieces}
      </div>
    </div>
  );
}

export function Board() {
  const { 
    state, 
    selectStack, 
    moveStack, 
    newGame,
    processNextBearMove
  } = useGame();

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardDims, setBoardDims] = useState<BoardDimensions>({
    cellSize: 60,
    boardOffset: { x: 0, y: 0 },
  });
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const animationFrameRef = useRef<number | null>(null);

  // Measure board dimensions on mount and resize
  const measureBoard = useCallback(() => {
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      // Cell width = (board width - padding*2 - gap*4) / 5
      const cellSize = (rect.width - BOARD_PADDING * 2 - CELL_GAP * 4) / 5;
      setBoardDims({
        cellSize,
        boardOffset: { x: BOARD_PADDING, y: BOARD_PADDING },
      });
    }
  }, []);

  useEffect(() => {
    measureBoard();
    window.addEventListener('resize', measureBoard);
    return () => window.removeEventListener('resize', measureBoard);
  }, [measureBoard]);

  // Sync state.animatingMove (from bear moves) to local animatingMove
  useEffect(() => {
    if (state.animatingMove && (!animatingMove || state.animatingMove.startTime !== animatingMove.startTime)) {
      setAnimatingMove(state.animatingMove);
      setAnimProgress(0);
    }
  }, [state.animatingMove, state.currentTurn]);

  // Calculate animation progress using useEffect for smooth animation
  useEffect(() => {
    if (!animatingMove) {
      setAnimProgress(0);
      return;
    }

    // Cancel animation if game is reset
    if (state.gameOver) {
      setAnimatingMove(null);
      setAnimProgress(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }
    
    const startTime = animatingMove.startTime;
    const duration = animatingMove.duration;
    
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimProgress(progress);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete - apply the move based on whose turn it is
        if (state.currentTurn === 'player') {
          moveStack(animatingMove.to);
        } else if (state.currentTurn === 'bear' && state.processingBearMoves) {
          // For bear moves, process the next move in the queue
          processNextBearMove();
        }
        setAnimatingMove(null);
        setAnimProgress(0);
      }
    };
    
    animate();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animatingMove, moveStack, state.currentTurn, state.processingBearMoves, processNextBearMove]);

  const handleCellClick = (row: number, col: number, stack: Stack | null) => {
    if (state.gameOver || animatingMove) return;

    if (state.currentTurn === 'player') {
      if (state.selectedStackId) {
        if (stack && stack.id === state.selectedStackId) {
          // Clicked same stack - pass
          moveStack({ row, col });
        } else if (state.validMoves.some(m => m.row === row && m.col === col)) {
          // Valid move - start animation
          const selectedStack = state.board.flat().find(s => s?.id === state.selectedStackId);
          if (selectedStack) {
            startAnimation(selectedStack, { row, col });
          }
        } else if (stack && stack.player === 'player') {
          // Select different stack
          selectStack(stack.id);
        } else {
          // Deselect
          selectStack(state.selectedStackId);
        }
      } else if (stack && stack.player === 'player') {
        // Select stack
        selectStack(stack.id);
      }
    }
  };

  const handleSkyClick = (col: number) => {
    if (state.gameOver || animatingMove) return;
    if (state.currentTurn !== 'player') return;
    if (!state.validMoves.some(m => m.row === -1 && m.col === col)) return;

    const selectedStack = state.board.flat().find(s => s?.id === state.selectedStackId);
    if (selectedStack) {
      startAnimation(selectedStack, { row: -1, col });
    }
  };

  const startAnimation = (stack: Stack, to: Position) => {
    const from = stack.position;
    setAnimatingMove({
      stack,
      from,
      to,
      startTime: Date.now(),
      duration: ANIMATION_DURATION,
    });
  };

  // During animation, hide the piece at the destination
  const getDisplayStack = (row: number, col: number): Stack | null => {
    if (animatingMove && animatingMove.to.row === row && animatingMove.to.col === col) {
      return null;
    }
    return state.board[row][col];
  };

  // For sky moves, we don't hide anything on the board since destination is off-board
  const isSkyDestination = animatingMove?.to.row === -1;

  return (
    <div className="game-container">
      <header className="game-header">
        <h1>El Oso</h1>
        <div className="score-board">
          <div className="score-item sky">
            <span className="label">Sky</span>
            <span className="value">{state.playerPiecesInSky}</span>
            {state.playerPiecesInSky >= 12 && <span className="win-badge">SUPERIOR WIN!</span>}
            {state.playerPiecesInSky >= 10 && state.playerPiecesInSky < 12 && <span className="win-badge">WIN!</span>}
          </div>
          <div className="score-item pit">
            <span className="label">Pit</span>
            <span className="value">{state.playerPiecesInPit}</span>
          </div>
          <div className="score-item cave">
            <span className="label">Cave</span>
            <span className="value">{state.bearPiecesInCave}</span>
          </div>
        </div>
      </header>

      <div className="game-board-wrapper">
        <div className="board-container" style={{ position: 'relative' }}>
          {/* Sky label */}
          <div className="sky-label">SKY</div>
          {/* Sky row */}
          <div className="sky-row">
            {Array.from({ length: 5 }).map((_, col) => (
              <div 
                key={col} 
                className={`sky-cell ${state.validMoves.some(m => m.row === -1 && m.col === col) ? 'valid-move' : ''}`}
                onClick={() => handleSkyClick(col)}
              >
                {state.playerPiecesInSky > col && (
                  <div className="sky-piece player" />
                )}
              </div>
            ))}
          </div>

          {/* Main board */}
          <div 
            ref={boardRef}
            className="board" 
            role="grid" 
            aria-label="Game board" 
            style={{ position: 'relative' }}
          >
            {state.board.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row" role="row">
                {row.map((stack, colIndex) => {
                  const displayStack = isSkyDestination ? stack : getDisplayStack(rowIndex, colIndex);
                  return (
                    <BoardCell
                      key={colIndex}
                      row={rowIndex}
                      col={colIndex}
                      stack={displayStack}
                      isSelected={state.selectedStackId === displayStack?.id}
                      isValidMove={state.validMoves.some(m => m.row === rowIndex && m.col === colIndex)}
                      onClick={() => handleCellClick(rowIndex, colIndex, displayStack)}
                      animatingMove={animatingMove}
                    />
                  );
                })}
              </div>
            ))}
            
            {/* Animating stack rendered at board level for proper positioning */}
            {animatingMove && (
              <AnimatingStack
                stack={animatingMove.stack}
                from={animatingMove.from}
                to={animatingMove.to}
                progress={animProgress}
                dims={boardDims}
              />
            )}
          </div>

          {/* Ground row */}
          <div className="ground-row">
            {Array.from({ length: 5 }).map((_, col) => (
              <div key={col} className="ground-cell">
                {state.bearPiecesOnGround > col && (
                  <div className="ground-piece bear" />
                )}
              </div>
            ))}
          </div>
          {/* Ground label */}
          <div className="ground-label">GROUND</div>
        </div>

        <aside className="sidebar">
          <div className="status-panel">
            <p className={`status-message ${state.currentTurn}`}>
              {state.message}
            </p>
            
            <div className="game-info">
              <h3>How to Play</h3>
              <ul>
                <li>Click a stack to select it</li>
                <li>Click a highlighted cell to move</li>
                <li>Stacks move up to their height</li>
                <li>Diagonal or lateral only (no straight)</li>
                <li>From top row: move diagonally up to Sky</li>
                <li>Get 10+ pieces to Sky to win</li>
                <li>12 pieces = Superior Win</li>
                <li>Click selected stack again to pass</li>
                <li>Bear moves after your turn</li>
              </ul>
            </div>

            {state.gameOver && (
              <div className="game-over">
                <h2>{state.winner === 'player' ? 'Victory!' : 'Defeat'}</h2>
                <p>{state.message}</p>
                <button onClick={newGame} className="new-game-btn">New Game</button>
              </div>
            )}

            {!state.gameOver && (
              <button onClick={newGame} className="new-game-btn secondary">New Game</button>
            )}

            {state.bearLog.length > 0 && (
              <div className="bear-log">
                <h3>Bear's Turn Log</h3>
                <ul>
                  {state.bearLog.map((entry, idx) => (
                    <li key={idx} className={`log-entry ${entry.action.replace(/\s+/g, '-').toLowerCase()}`}>
                      <span className="roll">Roll: {entry.roll === -1 ? '—' : entry.roll === 6 ? '6 (blank)' : entry.roll}</span>
                      <span className="column">Col: {entry.column === -1 ? '—' : entry.column}</span>
                      <span className="action">{entry.action}</span>
                      {entry.details && <span className="details">{entry.details}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function BoardCell({ 
  row, 
  col, 
  stack, 
  isSelected, 
  isValidMove, 
  onClick,
  animatingMove
}: { 
  row: number; 
  col: number; 
  stack: Stack | null; 
  isSelected: boolean; 
  isValidMove: boolean; 
  onClick: () => void;
  animatingMove: AnimatingMove | null;
}) {
  return (
    <button
      className={`cell ${stack?.player || ''} ${isSelected ? 'selected' : ''} ${isValidMove ? 'valid-move' : ''}`}
      onClick={onClick}
      aria-label={stack 
        ? `${stack.player} stack of ${stack.pieces} at ${String.fromCharCode(65 + col)}${6 - row}` 
        : `Empty cell ${String.fromCharCode(65 + col)}${6 - row}`}
      disabled={!!animatingMove}
    >
      {stack && (
        <div className="stack">
          <div className="stack-pieces">
            {Array.from({ length: Math.min(stack.pieces, 5) }).map((_, i) => (
              <div key={i} className={`piece ${stack.player}`} />
            ))}
            {stack.pieces > 5 && (
              <div className="piece-count">+{stack.pieces - 5}</div>
            )}
          </div>
          <div className="stack-height">{stack.pieces}</div>
        </div>
      )}
    </button>
  );
}