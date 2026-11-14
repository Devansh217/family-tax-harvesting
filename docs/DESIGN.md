# Design system v1 — "Quiet ledger"

**Status:** Draft for review · **Date:** 14 Nov 2026 · **Screens:** [design canvas](https://claude.ai/artifact/7FhQUhEnD1UrW5sLcYsVQG)

## 1. Principles

1. **One number first.** Every screen leads with the single figure that matters there (family room left, saving on this move, tax on this sale), written as the start of a sentence, never as a label-over-number stat tile.
2. **Rupees, not percentages.** Savings and tax are always shown in ₹, in Indian grouping (₹1,25,000; ₹4.95 L above 1 lakh in summaries).
3. **Calm, then urgent.** The palette is quiet most of the year. Amber appears only for time pressure (days left, lots about to turn long-term).
4. **Show the arithmetic.** Any number can be tapped to see how it was computed. Trust comes from transparency, not branding.
5. **Never pretend to trade.** The app explains and checks; the broker app executes. No "Sell" buttons, only "Add to plan" and "Mark done".
6. **Fast is a feature.** No spinners on navigation. Skeletons only on first load; after that, cached data plus a quiet "Updated 2 min ago".

## 2. Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#F2F4F1` | `#0C1210` | App background |
| `surface` | `#FFFFFF` | `#141B18` | Cards, sheets |
| `ink` | `#0D1B16` | `#E6ECE8` | Primary text, figures |
| `ink-2` | `#4A5952` | `#9AA8A1` | Secondary text (≥ 4.5:1 on surface) |
| `line` | `#E1E6E1` | `#25302B` | Dividers, borders |
| `track` | `#E9EDE9` | `#1E2723` | Empty part of meters |
| `room` | `#0B7A55` | `#4CC992` | Free room, savings, positive |
| `room-soft` | `#E2F2EA` | `#13291F` | Saving chips |
| `plan` | `#3A4FD0` | `#8C9CFF` | Planned (in plan, not done), links |
| `used` | `#A3AEA8` | `#56625C` | Used room (decorative fill only) |
| `time` | `#A35C00` | `#F0B45C` | Days left, wait alerts |
| `time-soft` | `#FDF0DC` | `#2E2412` | Deadline banner |
| `tax` | `#B4352B` | `#FF8A80` | Tax due beyond room |

Meter segments differ in lightness as well as hue (used light grey, planned mid indigo, free dark green, 2 px gaps between), so they read for colour-blind users and in greyscale.

### Type

| Style | Font | Size / line | Use |
|---|---|---|---|
| Display | Bricolage Grotesque 700 | 44/50, tabular figures | The one number per screen, written as part of a sentence |
| Title | Bricolage Grotesque 700 | 28/34 | Screen titles |
| Heading | Hanken Grotesk 600 | 16/22 | Card titles |
| Body | Hanken Grotesk 400 | 15/22 | Text |
| Figure | Hanken Grotesk 600, `tnum` | 15/22 | Amounts in lists, right-aligned |
| Label | Hanken Grotesk 600 | 12/16, +0.02em | Section labels, meter legends |

Inter was rejected as too generic for a consumer brand. Check ₹ glyph and tabular-figure support in both faces before build; fall back to the system font for ₹ only if missing. Minimum text 12 px; parents use the app too, so Dynamic Type / Android font scaling is supported up to 130% without truncating figures.

### Space, shape, motion
- 4 px base grid; screen gutter 20 px; card padding 16 px; gap between cards 12 px.
- Radius 16 px cards, 12 px inputs, 999 px chips and meters.
- Touch targets ≥ 44 px.
- Motion: meters fill in 400 ms ease-out on first view only; no motion with reduced-motion on.

## 3. Signature components

| Component | Anatomy | Notes |
|---|---|---|
| **Room meter** | Pill track split into Used / Planned / Free, value right-aligned ("₹1,05,000 free") | The product's visual signature. Used in member rows (8 px), member header (14 px) |
| **Family stack** | One horizontal bar made of each member's free room, labelled with initials | Home hero: shows at a glance who holds the room |
| **Countdown chip** | Amber chip "137 days left · FY ends 31 Mar" | Turns solid amber under 30 days |
| **Move card** | Member avatar · what to do ("Sell and rebuy 210 units") · saving chip · state control | Kinds: Harvest gain, Harvest loss, Wait, Gift |
| **Saving chip** | Green soft chip "Saves ₹16,250" | Always the right-most element in a move |
| **Member avatar** | Initials on a tint unique per member, consistent across screens | Never photos (privacy, parents' accounts) |
| **Source row** | Logo-free text label of source, last sync, status dot | No broker logos (no endorsement implied) |
| **Explain sheet** | Bottom sheet showing the arithmetic for any figure | Opened by tapping a figure |

## 4. Screens in the canvas

1. **Connect** — onboarding, data sources, privacy promise.
2. **Home** — family room, days left, saving available, member rooms, top moves.
3. **Member** — one person's room meter, gains booked, lots turning long-term.
4. **Plan** — moves grouped by kind, checklist, saving achieved.
5. **Simulate** — sell amount → tax per member, best seller highlighted.
6. **Family** — members, consent, clubbing tags, invite.
7. **System** — tokens and components on one board.

All sample data is illustrative: a five-member family (Arjun the Owner, Meera his spouse, Ramesh and Sunita his parents, Kabir his 19-year-old son).

## 5. Copy rules

- Sentence case everywhere. Verbs on buttons ("Add to plan", "Mark done").
- Say what happens, not what it is called: "Sell and buy back the next day" beside the technical "harvest gain".
- Every move ends with the same footnote: "Planning estimate, not advice. Check large moves with a CA."
- Dates as "31 Mar", money as "₹1,25,000"; "₹4.95 L" only in summaries.
