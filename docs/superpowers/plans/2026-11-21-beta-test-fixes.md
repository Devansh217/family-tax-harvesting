# Beta test fixes: plan

21 Nov 2026 · Spec: `docs/superpowers/specs/2026-11-21-beta-test-fixes-design.md` · Branch: `beta-test-fixes`

Each task is test-first where there is logic to test. Run `npm --prefix prototype test` and `npm --prefix prototype run typecheck` after each task.

1. **Relation pairs and Grandparent** (spec §3). Add `'grandparent'` to `Relation` (`engine/types.ts`) and `RELATIONS` (`ui/format.ts`). Add the new `fromManager` pairs in `engine/relations.ts`. Tests in `engine/relations.test.ts`. Rebuild the server engine copy (`npm run build:engine`).
2. **Auto-linking** (spec §2). New `engine/links.ts`: `autoLink(members, changedId?, previousRelation?)` and `linkProblems(member, members)`. Record which links are automatic in `Member.autoLinks`. `store.ts` load runs `autoLink` (gaps only), replacing `linkFamily`. Family save runs `autoLink` for the saved member. Tests in `engine/links.test.ts`.
3. **Member form** (spec §2). `PersonFields`: a one-line link summary, a "Change links" disclosure, choices filtered by relation, "Whose wife?" for a son's wife, and save checks shown next to the field.
4. **Simulate** (spec §4). Pure helpers in `ui/simulate.ts` (default amount, share quick picks, next long-term date), with tests. Screen changes in `Simulate.tsx`.
5. **Home loss label** (spec §5).
6. **Verify.** Full tests, typecheck and build, then check the Family and Simulate screens in the browser with the sample family.
