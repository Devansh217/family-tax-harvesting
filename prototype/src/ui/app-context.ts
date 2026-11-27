import { createContext, useContext } from 'react';
import type { FamilyView, Move } from '../engine/family';
import type { ISODate } from '../engine/types';
import type { AppState } from '../store';
import type { Market } from './market';
import type { Cloud } from './useCloud';

export interface Ctx {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  fam: FamilyView;
  /** The same family at the previous close, when the site has yesterday's prices. */
  famPrev: FamilyView | null;
  market: Market;
  /** The funds file has arrived or failed for good: fund categories are known, so moves can be recorded as shown. */
  marketSettled: boolean;
  cloud: Cloud;
  asOf: ISODate;
  go: (route: string) => void;
  toast: (msg: string) => void;
  indexOf: (memberId: string) => number;
  nameOf: (memberId: string) => string;
  /** Set while the founder views another family read-only (admin screen). */
  viewing: { name: string } | null;
}

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
};
