import { useGame } from '../hooks/useGame';
import type { Stack } from '../types/game';
import './Board.css';

export function Board() {
  const { 
    state, 
    selectStack, 
    moveStack, 
    newGame 
  } = useGame();

  const handleCellClick = (row: number, col: number, stack: Stack | null) => {
    if (state.gameOver) return;

    if (state.currentTurn === 'player') {
      if (state.selectedStackId) {
        if (stack && stack.id === state.selectedStackId) {
          // Clicked same stack - pass
          moveStack({ row, col });
        } else if (state.validMoves.some(m => m.row === row && m.col === col)) {
          // Valid move
          moveStack({ row, col });
        } else if (stack && stack.player === 'player') {
          // Select different stack
          selectStack(stack.id);
        } else {
          // Deselect
          selectStack(state.selectedStackId); // This will deselect
        }
      } else if (stack && stack.player === 'player') {
        // Select stack
        selectStack(stack.id);
      }
    }
  };

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
        <div className="board-container">
          {/* Sky label */}
          <div className="sky-label">SKY</div>
          {/* Sky row */}
          <div className="sky-row">
            {Array.from({ length: 5 }).map((_, col) => (
              <div 
                key={col} 
                className={`sky-cell ${state.validMoves.some(m => m.row === -1 && m.col === col) ? 'valid-move' : ''}`}
                onClick={() => !state.gameOver && state.currentTurn === 'player' && state.validMoves.some(m => m.row === -1 && m.col === col) && moveStack({ row: -1, col })}
              >
                {state.playerPiecesInSky > col && (
                  <div className="sky-piece player" />
                )}
              </div>
            ))}
          </div>

          {/* Main board */}
          <div className="board" role="grid" aria-label="Game board">
            {state.board.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row" role="row">
                {row.map((stack, colIndex) => (
                  <BoardCell
                    key={colIndex}
                    row={rowIndex}
                    col={colIndex}
                    stack={stack}
                    isSelected={state.selectedStackId === stack?.id}
                    isValidMove={state.validMoves.some(m => m.row === rowIndex && m.col === colIndex)}
                    onClick={() => handleCellClick(rowIndex, colIndex, stack)}
                  />
                ))}
              </div>
            ))}
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
  onClick 
}: { 
  row: number; 
  col: number; 
  stack: Stack | null; 
  isSelected: boolean; 
  isValidMove: boolean; 
  onClick: () => void; 
}) {
  return (
    <button
      className={`cell ${stack?.player || ''} ${isSelected ? 'selected' : ''} ${isValidMove ? 'valid-move' : ''}`}
      onClick={onClick}
      aria-label={stack 
        ? `${stack.player} stack of ${stack.pieces} at ${String.fromCharCode(65 + col)}${6 - row}` 
        : `Empty cell ${String.fromCharCode(65 + col)}${6 - row}`}
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