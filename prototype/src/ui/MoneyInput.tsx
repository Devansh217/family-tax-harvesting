import { useState, type InputHTMLAttributes } from 'react';
import type { Paise } from '../engine/types';
import { moneyText, parseRupees } from './money';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: Paise; onValue: (p: Paise) => void };

/** A rupee field that keeps what was typed (including "0") and reports paise; blank counts as zero. */
export function MoneyInput({ value, onValue, ...rest }: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input {...rest} inputMode="numeric" value={moneyText(typed, value)}
      onChange={(e) => { const p = parseRupees(e.target.value); setTyped(e.target.value); if (p != null || e.target.value.trim() === '') onValue(p ?? 0); }} />
  );
}
