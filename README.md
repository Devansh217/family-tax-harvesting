# Family Tax Harvesting App (India)

See how much tax-free capital gains room each PAN in the family has left this year, and how to use it.

**Live app:** https://devansh217.github.io/family-tax-harvesting/ (prototype v0.2) · original single-file v0.1 at [/v0.1/](https://devansh217.github.io/family-tax-harvesting/v0.1/)

## What it does today (prototype v0.1)

- **Buckets per person:** the ₹1.25 lakh LTCG exemption (used / planned / free), the basic exemption gap for low-income members, and tax on gains booked so far.
- **Gain harvesting:** which long-term holdings to sell and buy back the next trading day to use up the exemption, with future tax saved in rupees.
- **Loss harvesting:** which loss-making holdings offset gains already booked this year. It uses mandatory set-off order: short-term losses against any gain, long-term losses only against long-term gains.
- **"Wait" alerts:** short-term winners that turn long-term before 31 March.
- **Family gift planner:** fills parents', adult children's and siblings' unused room with your appreciated holdings. It excludes recipients whose gains would be clubbed back to you (spouse, minor child, son's wife, HUF).
- **Import from Kite:** paste the Holdings CSV. Backup and restore as JSON.
- All data stays in your browser (`localStorage`). No server, no login.

## Rules modelled (FY 2026-27, Income-tax Act 2025)

| Item | Value |
|---|---|
| LTCG on listed equity / equity MF (old s.112A, now s.198) | 12.5% above ₹1.25 L per PAN |
| STCG (old s.111A, now s.196) | 20% |
| Long-term threshold | held > 12 months |
| Cess | 4% (surcharge not modelled) |
| Basic exemption (residents) | ₹4 L new regime; ₹2.5 / 3 / 5 L old regime by age |
| 87A rebate | not applied to special-rate capital gains |

All rates are editable in the app.

## Prototype v0.2 (in progress)

A React app in [prototype/](prototype/) with a tested tax engine and CAS / broker file import. See [prototype/README.md](prototype/README.md) to run it and test with your own statements.

The planner foundation (Nov 2026, branch `planner-foundation`) adds:

- **Every holding taxed by its real type:** equity, slab rate (debt and conservative hybrid funds), other long-term (gold, overseas, balanced hybrid), interest and tax-free, read from AMFI's fund categories. Funds the app can't classify are listed under "Funds to check" until you pick.
- **One tax function** for every feature: set-off in the lowest-tax order, the ₹12 L rebate and marginal relief, standard and senior deductions, and the April 2023 debt-fund rule. Harvest room never crosses the ₹12 L line.
- **Compare ("what it brings home"):** the same money in each member's name, after tax, with gift and clubbing notes and three return scenarios.
- **Family setup:** dates of birth, spouse and parent links, HUFs, income sources, regime, deductions, consent and carried losses.
- **Clubbing between any two members** (e.g. Dad to Mum), stable move ids with a plain-English reason each, and an append-only record of every suggestion.

## Run v0.1 locally

It is a single static file:

```bash
open index.html        # macOS
xdg-open index.html    # Linux
```

## Roadmap

v1 product definition (consumer app, sized for 50,000 families):
- [docs/PRODUCT.md](docs/PRODUCT.md): personas, jobs, IA, flows, releases, pricing, compliance gates
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): stack, data model, hot paths, 31 March peak, security
- [docs/DESIGN.md](docs/DESIGN.md): "Quiet ledger" design system; screens on the [design canvas](https://claude.ai/artifact/7FhQUhEnD1UrW5sLcYsVQG)

Original idea: [docs/IDEA.md](docs/IDEA.md). Next up:
1. Lot-level engine (FIFO from broker tradebook, grandfathering at 31 Jan 2018 FMV)
2. CAS PDF import (CDSL/NSDL, CAMS/KFin) for mutual funds and buy dates
3. Reconcile against the broker's tax P&L
4. March deadline reminders, advance tax estimates

## Disclaimer

A planning calculator, not investment or tax advice. Check large moves with a chartered accountant.
