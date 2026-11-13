import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { GameId } from '@/games/registry';

// Populated one game at a time as each game's build phase lands. Lazy-loaded so Three.js and a
// game's 3D models never load until that game is actually opened.
export const GAME_VIEWS: Partial<Record<GameId, LazyExoticComponent<ComponentType>>> = {
  ludo: lazy(() => import('@/games/ludo/LudoGame')),
  city: lazy(() => import('@/games/city/CityGame')),
  poker: lazy(() => import('@/games/poker/RoyalPokerApp')),
  wildbound: lazy(() => import('@/games/wildbound/WildboundGame')),
};