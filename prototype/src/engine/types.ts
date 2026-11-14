/** Money is always integer paise. Quantities are integer units scaled by QTY_SCALE. Dates are ISO `YYYY-MM-DD`. */
export type Paise = number;
export type Qty = number;
export type ISODate = string;

export const QTY_SCALE = 10_000;

export type AssetKind = 'equity' | 'equity_mf' | 'other';

export type Relation =
  | 'self'
  | 'spouse'
  | 'parent'
  | 'child_adult'
  | 'child_minor'
  | 'sibling'
  | 'daughter_in_law'
  | 'other';

export interface Member {
  id: string;
  name: string;
  relation: Relation;
  age: number;
  regime: 'new' | 'old';
  /** Income other than capital gains this tax year (salary, pension, interest). Unknown means no bonus room is assumed. */
  otherIncome?: Paise;
  /** Set when income was given as a slab, not an exact figure: the band's label. `otherIncome` then holds its assumed income. */
  incomeBand?: string;
  /** Losses brought forward from earlier years. */
  carriedLoss?: { st: Paise; lt: Paise };
  /**
   * Trading income for this tax year, from the broker's tax P&L. Intraday (speculative) is also detected from
   * tradebooks; a figure entered here replaces the detected one.
   */
  business?: { intraday?: Paise; fno?: Paise; fnoTurnover?: Paise };
}

/** Delivery shares bought and sold on the same day in the same account: speculative business income. */
export interface IntradayTrade {
  memberId: string;
  isin: string;
  account: string;
  date: ISODate;
  qty: Qty;
  pnl: Paise;
}

export interface Security {
  isin: string;
  name: string;
  kind: AssetKind;
  /** Latest price per whole unit. */
  price?: Paise;
  priceDate?: ISODate;
  /** Fair market value per unit on 31 Jan 2018, for grandfathering. */
  fmv2018?: Paise;
  /** Other names this security appears under in imported files (tickers), for matching. */
  symbols?: string[];
}

export interface Txn {
  id: string;
  memberId: string;
  isin: string;
  date: ISODate;
  side: 'buy' | 'sell';
  qty: Qty;
  /** Total consideration for the whole quantity, in paise. */
  amount: Paise;
  /** Where it came from, e.g. "Zerodha tradebook". */
  source: string;
  /** Demat account or MF folio. First-in-first-out matching happens within one account. */
  account?: string;
  /** Date or cost was guessed (holdings with no trade history). Never used for suggested moves. */
  estimated?: boolean;
}

export interface Lot {
  memberId: string;
  isin: string;
  account: string;
  estimated?: boolean;
  date: ISODate;
  qty: Qty;
  cost: Paise;
  source: string;
}

export type Term = 'st' | 'lt';

export interface Realised {
  memberId: string;
  isin: string;
  account?: string;
  buyDate: ISODate;
  sellDate: ISODate;
  qty: Qty;
  proceeds: Paise;
  cost: Paise;
  gain: Paise;
  term: Term;
}

export interface LedgerWarning {
  memberId: string;
  isin: string;
  date: ISODate;
  message: string;
}

export interface Ledger {
  /** Open lots, oldest first, keyed `${memberId}|${isin}|${account}`. */
  lots: Map<string, Lot[]>;
  realised: Realised[];
  intraday: IntradayTrade[];
  warnings: LedgerWarning[];
}
