/** Money is always integer paise. Quantities are integer units scaled by QTY_SCALE. Dates are ISO `YYYY-MM-DD`. */
export type Paise = number;
export type Qty = number;
export type ISODate = string;

export const QTY_SCALE = 10_000;

/**
 * How a holding's gains are taxed (Income-tax Act 2025): `equity` 20% short / 12.5% long above ₹1.25 L (s.196, s.198);
 * `slab` at the member's slab rate, e.g. debt and conservative hybrid funds (s.76); `other_lt` slab short-term and
 * 12.5% long-term with no exemption, e.g. gold, international and balanced hybrid funds; `interest` taxed yearly at
 * slab; `exempt` not taxed; `check` not yet known (taxed as slab and flagged).
 */
export type TaxType = 'equity' | 'slab' | 'other_lt' | 'interest' | 'exempt' | 'check';

export type Relation =
  | 'self'
  | 'spouse'
  | 'parent'
  | 'grandparent'
  | 'child_adult'
  | 'child_minor'
  | 'sibling'
  | 'daughter_in_law'
  | 'other';

export type IncomeKind = 'salary' | 'pension' | 'interest' | 'rent' | 'business' | 'other';

/** One yearly income stream before deductions. `band` is set when the person gave a slab, not a figure. */
export interface IncomeSource { kind: IncomeKind; amount: Paise; from: 'ais' | 'manual' | 'band'; band?: string; asOf?: ISODate }

export interface Member {
  id: string;
  name: string;
  /** Absent means a person. */
  type?: 'person' | 'huf';
  /** Relation to the manager, for display. Tax rules use the links below, which work for any pair of members. */
  relation: Relation;
  /** Used when `dob` is missing. */
  age: number;
  dob?: ISODate;
  /** Resident in India (default). Non-residents get no basic-exemption room against special-rate gains. */
  resident?: boolean;
  regime: 'new' | 'old';
  spouseId?: string;
  parentIds?: string[];
  /** The links in `spouseId` and `parentIds` that were filled in from "Relation to you" (see links.ts), not set by hand. */
  autoLinks?: { spouseId?: string; parentIds?: string[] };
  /** Set when links were changed by hand on the member form: auto-linking then leaves this member's own links alone. */
  linksByHand?: boolean;
  /** For an HUF: the members (coparceners) whose gifts to it are clubbed back (s.99(3)). */
  hufMemberIds?: string[];
  /** Income other than capital gains this tax year. Undefined = not entered (no basic-exemption room assumed); [] = none. */
  income?: IncomeSource[];
  /** Old regime only: total of deductions such as 80C and 80D, as one figure. */
  deductions?: Paise;
  /** The manager's record that this adult agreed to being managed in the app. */
  consent?: { agreedAt: ISODate; recordedBy: string };
  /** Never the full PAN. */
  panLast4?: string;
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
  taxType: TaxType;
  /** Traded on an exchange (shares, ETFs): decides holding period for `other_lt` and dealing costs. */
  listed: boolean;
  /** Where the tax type came from: the ISIN (a share), AMFI's category, the repo override list, or the user. */
  taxTypeSource?: 'share' | 'amfi' | 'override' | 'user';
  /** SEBI category heading from AMFI, e.g. "Hybrid Scheme - Conservative Hybrid Fund". */
  category?: string;
  plan?: 'direct' | 'regular';
  option?: 'growth' | 'idcw';
  /** Distributor (ARN) code from the CAS, for regular plans. */
  distributor?: string;
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
  /** Long-term for sure, but the date is before the history and the cost is the broker's average (openingLots.ts). */
  approx?: boolean;
  /**
   * On a sell: the units left the account (a transfer, gift or buyback the history doesn't show), found by comparing
   * the newest holdings file with the history (openingLots.ts). Not a sale: no gain, no warning, never intraday.
   */
  left?: true;
}

export interface Lot {
  memberId: string;
  isin: string;
  account: string;
  estimated?: boolean;
  /** See Txn.approx: moves on it keep a cushion in the room. */
  approx?: boolean;
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
  taxType: TaxType;
  /**
   * Sold from a guessed lot (`estimated`), so the buy date is unknown and the term was set the safe way for room: a
   * gain long-term, a loss short-term; ELSS always long-term; non-equity keeps its own type. A `TermAnswer` clears it.
   */
  termUnknown?: true;
}

/**
 * The family's answer for one sale whose buy date is unknown, keyed by member, account, ISIN and sale date: the term
 * itself, or the buy date the term is worked out from. It only sets that past sale's term; a covering broker Tax P&L
 * still wins.
 */
export interface TermAnswer { memberId: string; account: string; isin: string; sellDate: ISODate; term?: Term; buyDate?: ISODate }

export interface LedgerWarning {
  memberId: string;
  isin: string;
  date: ISODate;
  message: string;
  /** The account the sale was in, and the units sold beyond what the history holds there. */
  account?: string;
  qty?: Qty;
}

export interface Ledger {
  /** Open lots, oldest first, keyed `${memberId}|${isin}|${account}`. */
  lots: Map<string, Lot[]>;
  realised: Realised[];
  intraday: IntradayTrade[];
  warnings: LedgerWarning[];
}
