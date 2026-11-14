# Family Tax Harvesting App (India)

**Status:** Raw idea, prototype starting · **Captured:** 11 Nov 2026

## One-liner
An app that reads a family's investment portfolio and shows, per person and for the family as a whole, how much tax-free capital gains room is left this year, what tax applies beyond it, and how to use each member's unused room.

## Problem
Each PAN gets its own ₹1.25 lakh long-term equity gains exemption every year, and it lapses if unused. Most families track this per person at best, never together, and only notice in March.

## Core experience
- Onboard each family member with PAN and consent, then pull their holdings and transactions
- A simple slider or bucket per person: exemption used so far, room remaining, and unrealised long-term gains that could fill it
- Beyond the bucket: the estimated tax if more gains are booked (12.5% LTCG, 20% STCG on equity)
- Family view: total unused room across members and suggestions for using it

## Key ideas to explore
- Lot-level capital gains engine (FIFO, grandfathering, carried-forward losses) as the foundation
- Loss harvesting alongside gain harvesting
- Using family members' room, for example gifting appreciated holdings to adult children or parents who then sell within their own exemption
- Data via PAN plus OTP consent (CAS statements, Account Aggregator) rather than stored credentials

## Feature roadmap (beyond the bucket)
### Money-saving actions (strongest reason to pay)
- Harvest plan: which lots to sell to fill the bucket, with tax saved shown in rupees — *prototype v0.1*
- Loss harvesting: flag loss-making lots that can offset gains already booked this year — *prototype v0.1*
- "Wait X days" alerts: lots about to turn long-term, where waiting cuts the tax — *prototype v0.1*
- Sell simulator: tax on a proposed sale, and which family member is best placed to sell

### Timing and reminders
- March deadline nudges when exemption is about to lapse
- Quarterly advance tax estimates after large sales

### Filing help
- ITR-ready capital gains schedule, including carried-forward losses
- Mismatch check against the tax department's AIS before filing

### Family depth
- Gift planner with clubbing rules built in and a gift deed template — *clubbing rules in prototype v0.1*
- HUF and senior-parent slabs for debt and interest income, not just equity

### Wider coverage
- ESOPs/RSUs and US stocks
- Property, gold and debt funds

Note: the harvest plan and gift planner cross into "advice" and need the regulatory check first.

## Monetisation
- Families: bucket view free; yearly subscription for actions and alerts, priced as a small slice of tax saved (for example ₹999 to ₹2,999)
- CAs and wealth advisors: per-client fee for a multi-family dashboard. Likely the faster revenue, and the professional gives the advice, which eases the SEBI question

## Risks / open questions
- Aadhaar probably should not be collected at all: PAN plus consent is enough for portfolio data, and holding Aadhaar adds legal and security burden
- Clubbing rules: gains on assets gifted to a spouse or minor child are taxed back in the giver's hands, so the family suggestions must respect this
- SEBI: personalised buy/sell suggestions may need Investment Adviser registration; a calculator showing numbers is safer than recommendations
- Data protection obligations for financial and identity data (DPDP Act)
- Accuracy: must reconcile with broker and registrar tax reports before users trust it

## Possible MVP
One taxpayer, local-first Python prototype: parse CAS and broker tradebook, compute year-to-date STCG/LTCG and unused exemption, reconcile against the broker's tax P&L. Then add a second family member and the combined bucket view.

## Next steps
- Agree data model and stack (proposed: Python, SQLite, lots / transactions / realised gains / carried-forward losses)
- Get sample files: broker tradebook (all years), CAS PDF, broker tax P&L, last year's carried-forward losses
- Build and reconcile the single-taxpayer engine
- Add family members, clubbing rules and the bucket view
- Check the regulatory position (SEBI, DPDP) with a professional
- Decide first paying segment: families directly, or CAs and advisors
