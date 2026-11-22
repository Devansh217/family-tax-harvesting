import type { SharesFile } from '../prices/parse';
import { nameKey, type ParseResult } from './common';

/**
 * Statements that name a company without its ISIN (`SYM:<name>`) are matched against the published names list:
 * current name, former name, then symbol. Unmatched ones keep their name and are listed in the warnings; they still
 * match later when another statement brings that company's ISIN.
 */
export function resolveNames(r: ParseResult, shares: Pick<SharesFile, 'byName' | 'bySymbol'> | null): ParseResult {
  const missed = new Set<string>();
  const fix = (isin: string, name: string) => {
    if (!isin.startsWith('SYM:')) return isin;
    const k = nameKey(isin.slice(4));
    const hit = shares ? shares.byName[k] ?? shares.bySymbol[k] : undefined;
    if (!hit) missed.add(name || isin.slice(4));
    return hit ?? isin;
  };
  const txns = r.txns.map((t) => ({ ...t, isin: fix(t.isin, t.name) }));
  const prices = r.prices.map((p) => ({ ...p, isin: fix(p.isin, p.name) }));
  const warnings = missed.size
    ? [...r.warnings, `Not matched to a listed share yet: ${[...missed].join(', ')}. Their trades are kept by name; import this file again later, or a statement with their ISIN, to match them.`]
    : r.warnings;
  return { ...r, txns, prices, warnings };
}

/** Excel saves a password-protected workbook (and old .xls files) in this container instead of a zip. */
export const isEncryptedOffice = (bytes: Uint8Array) =>
  bytes.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b);
