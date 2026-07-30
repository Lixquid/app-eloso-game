import { useState, useCallback } from 'react';
import type { GameState, Position } from '../types/game';
import { 
  createInitialState, 
  selectStack, 
  moveStack 
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

  return {
    state,
    selectStack: handleSelectStack,
    moveStack: handleMoveStack,
    newGame: handleNewGame,
  };
}