import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../hooks/useGame';
import type { Stack, Position } from '../types/game';
import {
  BOARD_ROWS,
  BOARD_COLS,
  WIN_THRESHOLD,
  SKY_TARGET,
  ANIMATION_DURATION_MS,
} from '../types/game';
import './Board.css';

interface Point {
  x: number;
  y: number;
}

/**
 * Board geometry measured from the real DOM elements (board cells, sky cells,
 * ground cells) relative to the board container, so animations stay aligned
 * with the CSS layout without duplicating CSS pixel values.
 */
interface BoardDims {
  cellW: number;
  cellH: number;
  pitchX: number;
  pitchY: number;
  originX: number;
  originY: number;
  skyCenters: Point[];
  groundCenters: Point[];
}

const EMPTY_DIMS: BoardDims = {
  cellW: 0,
  cellH: 0,
  pitchX: 0,
  pitchY: 0,
  originX: 0,
  originY: 0,
  skyCenters: [],
  groundCenters: [],
};

/** How far above the sky row the (virtual) Cave sits. */
const CAVE_RISE = 56;

function cellCenter(dims: BoardDims, row: number, col: number): Point {
  return {
    x: dims.originX + col * dims.pitchX + dims.cellW / 2,
    y: dims.originY + row * dims.pitchY + dims.cellH / 2,
  };
}

function clampCol(col: number): number {
  return Math.max(0, Math.min(BOARD_COLS - 1, col));
}

function pointForPosition(pos: Position, kind: 'player' | 'bear', dims: BoardDims): Point {
  if (pos.row === -1) {
    // Row -1 is the Sky for player moves, the Cave for bear pieces.
    const col = clampCol(pos.col);
    const sky = dims.skyCenters[col] ?? cellCenter(dims, 0, col);
    return kind === 'player' ? sky : { x: sky.x, y: sky.y - CAVE_RISE };
  }
  if (pos.row >= BOARD_ROWS) {
    return dims.groundCenters[clampCol(pos.col)] ?? cellCenter(dims, BOARD_ROWS - 1, clampCol(pos.col));
  }
  return cellCenter(dims, pos.row, pos.col);
}

interface ActiveAnim {
  kind: 'player' | 'bear';
  stack: Stack;
  from: Position;
  to: Position;
  startTime: number;
}

interface AnimatingStackProps {
  stack: Stack;
  from: Point;
  to: Point;
  progress: number;
}

function AnimatingStack({ stack, from, to, progress }: AnimatingStackProps) {
  const currentX = from.x + (to.x - from.x) * progress;
  const currentY = from.y + (to.y - from.y) * progress;
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
          <div className="piece-count">+{stack.pieces - 5}</div>
        )}
      </div>
      <div className="stack-height">{stack.pieces}</div>
    </div>
  );
}

export function Board() {
  const {
    state,
    selectStack,
    moveStack,
    newGame,
    processNextBearMove,
  } = useGame();

  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<BoardDims>(EMPTY_DIMS);
  const [anim, setAnim] = useState<ActiveAnim | null>(null);
  const [animProgress, setAnimProgress] = useState(0);

  // Measure the board geometry from the actual rendered cells.
  const measureBoard = useCallback(() => {
    const container = containerRef.current;
    const board = boardRef.current;
    if (!container || !board) return;

    const containerRect = container.getBoundingClientRect();
    const cells = board.querySelectorAll<HTMLButtonElement>('.cell');
    if (cells.length < BOARD_ROWS * BOARD_COLS) return;

    const c00 = cells[0].getBoundingClientRect(); // row 0, col 0
    const c01 = cells[1].getBoundingClientRect(); // row 0, col 1
    const r10 = cells[BOARD_COLS].getBoundingClientRect(); // row 1, col 0

    const skyCells = Array.from(container.querySelectorAll<HTMLDivElement>('.sky-cell'));
    const groundCells = Array.from(container.querySelectorAll<HTMLDivElement>('.ground-cell'));
    if (skyCells.length < BOARD_COLS || groundCells.length < BOARD_COLS) return;

    const center = (r: DOMRect): Point => ({
      x: r.left - containerRect.left + r.width / 2,
      y: r.top - containerRect.top + r.height / 2,
    });

    setDims({
      cellW: c00.width,
      cellH: c00.height,
      pitchX: c01.left - c00.left,
      pitchY: r10.top - c00.top,
      originX: c00.left - containerRect.left,
      originY: c00.top - containerRect.top,
      skyCenters: skyCells.map(c => center(c.getBoundingClientRect())),
      groundCenters: groundCells.map(c => center(c.getBoundingClientRect())),
    });
  }, []);

  useEffect(() => {
    measureBoard();
    const container = containerRef.current;
    if (container && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measureBoard);
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measureBoard);
    return () => window.removeEventListener('resize', measureBoard);
  }, [measureBoard]);

  // Start animating a bear step as soon as one is pending.
  useEffect(() => {
    if (anim || state.gameOver) return;
    if (state.currentTurn === 'bear' && state.currentBearStep) {
      const step = state.currentBearStep;
      setAnim({
        kind: 'bear',
        stack: step.stack,
        from: step.from,
        to: step.to,
        startTime: Date.now(),
      });
    }
  }, [state.currentBearStep, state.currentTurn, state.gameOver, anim]);

  // Drive the active animation; on completion apply the corresponding move.
  useEffect(() => {
    if (!anim) return;
    if (state.gameOver) {
      setAnim(null);
      setAnimProgress(0);
      return;
    }

    let raf = 0;
    const tick = () => {
      const progress = Math.min((Date.now() - anim.startTime) / ANIMATION_DURATION_MS, 1);
      setAnimProgress(progress);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setAnim(null);
      setAnimProgress(0);
      if (anim.kind === 'player') {
        moveStack(anim.to);
      } else {
        processNextBearMove();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim, state.gameOver, moveStack, processNextBearMove]);

  const handleNewGame = () => {
    setAnim(null);
    setAnimProgress(0);
    newGame();
  };

  const handleCellClick = (row: number, col: number, stack: Stack | null) => {
    if (state.gameOver || anim) return;

    if (state.currentTurn !== 'player') return;

    if (state.selectedStackId) {
      if (stack && stack.id === state.selectedStackId) {
        // Clicked same stack - pass
        moveStack({ row, col });
      } else if (state.validMoves.some(m => m.row === row && m.col === col)) {
        // Valid move - animate, then apply
        const selectedStack = state.board.flat().find(s => s?.id === state.selectedStackId);
        if (selectedStack) {
          setAnim({
            kind: 'player',
            stack: selectedStack,
            from: selectedStack.position,
            to: { row, col },
            startTime: Date.now(),
          });
        }
      } else if (stack && stack.player === 'player') {
        // Select different stack
        selectStack(stack.id);
      } else {
        // Deselect
        selectStack(null);
      }
    } else if (stack && stack.player === 'player') {
      // Select stack
      selectStack(stack.id);
    }
  };

  const handleSkyClick = (col: number) => {
    if (state.gameOver || anim) return;
    if (state.currentTurn !== 'player') return;
    if (!state.validMoves.some(m => m.row === -1 && m.col === col)) return;

    const selectedStack = state.board.flat().find(s => s?.id === state.selectedStackId);
    if (selectedStack) {
      setAnim({
        kind: 'player',
        stack: selectedStack,
        from: selectedStack.position,
        to: { row: -1, col },
        startTime: Date.now(),
      });
    }
  };

  // During an animation the piece is depicted by the animating element, so the
  // cell it is leaving is shown empty.
  const getDisplayStack = (row: number, col: number): Stack | null => {
    if (
      anim &&
      anim.from.row === row &&
      anim.from.col === col &&
      anim.from.row >= 0 &&
      anim.from.row < BOARD_ROWS
    ) {
      return null;
    }
    return state.board[row][col];
  };

  return (
    <div className="game-container">
      <header className="game-header">
        <h1>El Oso</h1>
        <div className="score-board">
          <div className="score-item sky">
            <span className="label">Sky</span>
            <span className="value">{state.playerPiecesInSky}</span>
            {state.playerPiecesInSky >= SKY_TARGET && <span className="win-badge">SUPERIOR WIN!</span>}
            {state.playerPiecesInSky >= WIN_THRESHOLD && state.playerPiecesInSky < SKY_TARGET && <span className="win-badge">WIN!</span>}
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
        <div ref={containerRef} className="board-container" style={{ position: 'relative' }}>
          {/* Sky label */}
          <div className="sky-label">SKY</div>
          {/* Sky row */}
          <div className="sky-row">
            {Array.from({ length: BOARD_COLS }).map((_, col) => (
              <div
                key={col}
                className={`sky-cell ${state.validMoves.some(m => m.row === -1 && m.col === col) ? 'valid-move' : ''}`}
                onClick={() => handleSkyClick(col)}
              >
                {state.playerPiecesInSky > col && <div className="sky-piece player" />}
                {col === BOARD_COLS - 1 && state.playerPiecesInSky > BOARD_COLS && (
                  <div className="piece-count">+{state.playerPiecesInSky - BOARD_COLS}</div>
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
                {row.map((_stack, colIndex) => {
                  const displayStack = getDisplayStack(rowIndex, colIndex);
                  return (
                    <BoardCell
                      key={colIndex}
                      row={rowIndex}
                      col={colIndex}
                      stack={displayStack}
                      isSelected={state.selectedStackId === displayStack?.id}
                      isValidMove={state.validMoves.some(m => m.row === rowIndex && m.col === colIndex)}
                      onClick={() => handleCellClick(rowIndex, colIndex, displayStack)}
                      disabled={!!anim}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Ground row */}
          <div className="ground-row">
            {Array.from({ length: BOARD_COLS }).map((_, col) => (
              <div key={col} className="ground-cell">
                {state.bearPiecesOnGround > col && <div className="ground-piece bear" />}
                {col === BOARD_COLS - 1 && state.bearPiecesOnGround > BOARD_COLS && (
                  <div className="piece-count">+{state.bearPiecesOnGround - BOARD_COLS}</div>
                )}
              </div>
            ))}
          </div>
          {/* Ground label */}
          <div className="ground-label">GROUND</div>

          {/* Animating stack rendered at container level for proper positioning */}
          {anim && dims.skyCenters.length === BOARD_COLS && (
            <AnimatingStack
              stack={anim.stack}
              from={pointForPosition(anim.from, anim.kind, dims)}
              to={pointForPosition(anim.to, anim.kind, dims)}
              progress={animProgress}
            />
          )}
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
                <li>Get {WIN_THRESHOLD}+ pieces to Sky to win</li>
                <li>{SKY_TARGET} pieces = Superior Win</li>
                <li>Click selected stack again to pass</li>
                <li>Bear moves after your turn</li>
              </ul>
            </div>

            {state.gameOver && (
              <div className="game-over">
                <h2>{state.winner === 'player' ? 'Victory!' : 'Defeat'}</h2>
                <p>{state.message}</p>
                <button onClick={handleNewGame} className="new-game-btn">New Game</button>
              </div>
            )}

            {!state.gameOver && (
              <button onClick={handleNewGame} className="new-game-btn secondary">New Game</button>
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
  disabled,
}: {
  row: number;
  col: number;
  stack: Stack | null;
  isSelected: boolean;
  isValidMove: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      className={`cell ${stack?.player || ''} ${isSelected ? 'selected' : ''} ${isValidMove ? 'valid-move' : ''}`}
      onClick={onClick}
      aria-label={stack
        ? `${stack.player} stack of ${stack.pieces} at ${String.fromCharCode(65 + col)}${BOARD_ROWS - row}`
        : `Empty cell ${String.fromCharCode(65 + col)}${BOARD_ROWS - row}`}
      disabled={disabled}
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