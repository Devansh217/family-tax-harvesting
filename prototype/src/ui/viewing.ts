import { computeFamily } from '../engine/family';
import { FY_2026_27 } from '../engine/rules';
import type { AppState } from '../store';
import type { Ctx } from './app-context';
import { withFunds, withPrices } from './market';

/**
 * The app context while the founder looks at another family through the logged admin read: their family on every
 * screen, and edits do nothing. The founder's own state and sync are untouched (useCloud keeps his state), so
 * nothing viewed can ever be saved into his account.
 */
export function viewedContext(base: Ctx, viewed: AppState, name: string): Ctx {
  const securities = withPrices(withFunds(viewed.securities, base.market.funds, viewed.taxTypeOverrides ?? {}), base.market.latest);
  const fam = computeFamily({ ...viewed, securities }, base.asOf, FY_2026_27);
  return {
    ...base,
    state: viewed,
    fam,
    famPrev: null,
    viewing: { name },
    update: () => base.toast('Read-only: you are viewing another family'),
    indexOf: (id) => Math.max(0, viewed.members.findIndex((m) => m.id === id)),
    nameOf: (id) => viewed.members.find((m) => m.id === id)?.name ?? 'Unknown',
  };
}
