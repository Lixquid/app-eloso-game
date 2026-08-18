import { useState, useCallback } from 'react';
import type { GameState, Position } from '../types/game';
import { 
  createInitialState, 
  selectStack, 
  moveStack,
  processNextBearMove
} from '../game/logic';

export function useGame() {
  const [state, setState] = useState<GameState>(() => createInitialState());

  const handleSelectStack = useCallback((stackId: string | null) => {
    setState(prev => selectStack(prev, stackId));
  }, []);

  const handleMoveStack = useCallback((targetPos: Position) => {
    setState(prev => moveStack(prev, targetPos));
  }, []);

  const handleNewGame = useCallback(() => {
    setState(createInitialState());
  }, []);

  const handleProcessNextBearMove = useCallback(() => {
    setState(prev => processNextBearMove(prev));
  }, []);

  return {
    state,
    selectStack: handleSelectStack,
    moveStack: handleMoveStack,
    newGame: handleNewGame,
    processNextBearMove: handleProcessNextBearMove,
  };
}