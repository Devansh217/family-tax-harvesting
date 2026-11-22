# Beta test fixes: design

21 Nov 2026 · Status: **built on branch `beta-test-fixes` (21 Nov 2026), not merged.** Plan: `docs/superpowers/plans/2026-11-21-beta-test-fixes.md`. Two calls made while building: a grandparent with two parents in the family is linked by ticking them under the parent's "Parents in the family" (no separate "which parent?" question); the short-term note in Simulate shows for equity only, because other fund types never get the ₹1.25 L room. Source: the founder's test notes (`~/Desktop/Test evidance /Test`) and two screenshots (Simulate a sale on ATHERENERG; Home, Room by member).

## 1. Findings

| # | What the founder saw | Cause in the code |
|---|---|---|
| F1 | Editing a member shows "Parents in the family: Devansh, Rekha" as plain checkboxes. Nothing is ticked for you, even when "Relation to you" already says who they are. | `PersonFields` (`ui/screens/memberFields.tsx`) lists every other member as a possible parent and spouse. `linkFamily` (`store.ts:73`) works out links from "Relation to you" only once, for families saved before links existed. It stops as soon as any member has a link, so members you add later get no links. |
| F2 | For a parent, the Spouse field offers Devansh and Nidhi. That makes no sense. | Same form: the spouse list is everyone. There is no filter by relation. |
| F3 | Two members both set to "Parent", with no spouse link, are treated as **unrelated** by the tax rules. | The `fromManager` fallback (`engine/relations.ts`) has no `parent>parent` entry, so the pair falls to `'other'`. A gift between them is then treated as a gift from a non-relative (taxable over ₹50,000), and the husband–wife clubbing rule is skipped. This is a tax bug, not just a form problem. `sibling>sibling`, `parent>sibling` and `sibling>parent` are missing as well. |
| F4 | Simulate a sale starts at ₹3 L, with ₹1 L / 3 L / 5 L / 10 L buttons. For a ₹78,921 holding, every button is too big, and there is no way to say "all of it" or "half". | `Simulate.tsx`: `amountText` defaults to `'300000'` and `presets` is a fixed list in rupees. |
| F5 | (screenshot) Simulate shows ₹4,671 tax with "uses ₹0 of room", and doesn't explain why. | The whole ₹22,457 gain is short-term. Tax is 20% + 4% cess = 20.8%, which gives ₹4,671. The ₹1.25 L room only covers long-term equity gains. The screen doesn't say this, and doesn't say when the lots turn long-term. |
| F6 | (screenshot) Home shows "−₹1,688 long-term gains". | `Home.tsx:109` adds up unrealised long-term gain and prints a negative total as a "gain". |

## 2. Fix: "Relation to you" sets the links (F1, F2)

**Rule.** "Relation to you" decides the family links. The member form fills them in automatically and shows them as a sentence. You can still change them, but you no longer have to set them.

Links each relation sets, applied when the member is saved (on both sides, so a spouse link is always two-way):

| Relation to you | Links set automatically |
|---|---|
| Spouse | Spouse ↔ you |
| Parent | You get this person as a parent. If exactly two members are parents, they are each other's spouse. |
| Adult / minor child | Parents = you, plus your spouse if one is in the family |
| Sibling | Same parents as you (only parents who are in the family) |
| Son's wife | Spouse ↔ your son, when only one adult child is in the family. With more than one, the form asks "Whose wife?" (a list of adult children only). |
| Grandparent (new option) | When one of your parents is in the family: a parent of that parent (the form asks which, if two). When none is: no link needed, because the tax rules recognise the relation directly (section 3). |
| Other relative | None |

**Never overwrite what you set yourself.** Automatic links only fill gaps. If you have already set a link by hand, it stays. Changing "Relation to you" clears only the links the old relation had set automatically. Each member records which of their links were set automatically, so the form can tell them apart.

**The form:**
- The raw "Spouse" dropdown and "Parents in the family" checkboxes go behind a **"Change links"** disclosure. In their place is one line, for example: *"Rekha: your mother · spouse of Ramesh."*
- When "Change links" is open, the choices are only ones that make sense:
  - **Spouse** for a parent: only the other parent. For a child: other members who aren't their parent or sibling. For you: anyone not marked as a parent or child.
  - **Parents** for a parent: only members marked Grandparent (hidden when there are none). For you: only members marked Parent.
  - **No field at all when there is nothing to pick.** For example, a parent with no other parent in the family gets no Spouse field. This answers the founder's question.
- **Check on save:** a member can't be both the spouse and a parent of the same person, and can't be their own parent's parent. If either happens, show the error next to the field and don't save.

**Existing families:** run the same automatic linking once on load, filling gaps only. This replaces `linkFamily`'s "only if no links at all" check.

## 3. Fix: missing relation pairs in the tax rules (F3)

Add to the `fromManager` table in `engine/relations.ts`:

| Pair | Relation |
|---|---|
| `parent>parent` | spouse |
| `sibling>sibling` | sibling |
| `parent>sibling`, `sibling>parent` | child / parent |
| `child_*>child_*` | sibling |
| `spouse>sibling`, `sibling>spouse` | other (sibling-in-law isn't a "relative" for the gift rule) |
| `self>grandparent`, `grandparent>self` | grandparent / grandchild |
| `parent>grandparent`, `grandparent>parent` | other. Which parent's parent can't be told without a link, so the safe answer is "not related". |

**Grandparent becomes a "Relation to you" option.** Add `'grandparent'` to `Relation` in `engine/types.ts` and `RELATIONS` in `ui/format.ts`. It matters for tax: a grandparent is a lineal ascendant, so gifts between you and your grandparent are tax-free for the gift rule. Today a grandparent can only be entered as "Other relative", which the rules treat as unrelated. The app would then never suggest a gift to a grandparent with a low income, and would treat a gift from them as taxable over ₹50,000. Your own parents, as grandparents of your children, already work through the links.

**What changes for families:** a gift between two parents is now clubbed back to the giver, as the law requires. The app stops suggesting it as a way to move tax. Families who saw that suggestion will see it disappear, so it goes in the beta release note.

## 4. Fix: Simulate a sale amounts (F4, F5)

1. **Default amount** = the largest amount any one member holds of the selected holding, not ₹3 L. It resets when the holding changes.
2. **Quick picks are shares of the holding, not fixed rupee amounts:** `25%` · `50%` · `75%` · `All`. Each shows its rupee value (for example, "50% · ₹39,460"). They are worked out from the largest single holding, because one member has to make the whole sale. You can still type any amount.
3. **"Sell all" on each member's row:** each row gets a second action, "All of {name}'s units (₹x)". It sets the amount to that member's whole holding. This covers families where several members hold different amounts.
4. **Too large:** if the amount is more than anyone holds, the message says *"The most one member holds is ₹78,921"*, with a "Use ₹78,921" button. Today it just says "No single member holds this much."
5. **Why the room isn't used (F5):** when a row's gain is all or mostly short-term, add a line: *"All short-term, taxed at 20%. The ₹1.25 L tax-free room covers long-term gains only. {n} units turn long-term on {date}."* The date is the next long-term date among this member's lots in gain, taken from the same lot data `engine/events.ts` uses for "Upcoming dates". The engine doesn't change.

Not chosen: a separate "% of holding" input mode. When several members hold different amounts, "50%" means a different rupee amount for each, so the "Lowest tax" comparison would no longer compare the same sale. Showing percentages as quick picks for one rupee amount keeps the comparison fair.

## 5. Fix: Home loss label (F6)

When a member's unrealised long-term total is below zero, show *"₹1,688 long-term loss (not yet booked)"*. When it is zero or more, keep *"₹x long-term gains"*.

## 6. Tests

- `relations.test.ts`: every new `fromManager` pair. With no links, `isRelative(you, grandparent)` is true and `canGift` follows it. Two parents with no links count as spouses for `clubbing` and `isRelative`. `canGift(parentA, parentB)` is false.
- New `links.test.ts` (pure function `autoLink(members)`): each row of the section 2 table; "Son's wife" with 0, 1 and 2 adult children; links you set by hand are never overwritten; changing a relation clears only automatic links; the save checks.
- Simulate: the default equals the largest single holding; the quick picks give the right rupee values for a holding under ₹1 L; "All of {name}'s units" sets that member's exact holding value; the short-term explanation appears only when short-term gain is above zero.
- Home: the negative total shows as a loss.

## 7. Decisions (21 Nov 2026)

1. **Quick-pick basis:** largest single holding (founder).
2. **Grandparents:** the founder asked whether it matters for tax. It does: see the grandparent note in section 3. Claude's call is to add Grandparent as a "Relation to you" option instead of keeping a free "Parents" field on parents.
