# SDD ledger — plan: docs/superpowers/plans/2026-07-26-foundation.md

Branch: main (human approved implementing directly on main, greenfield repo)

STANDING INSTRUCTION (human, mid-Task-7): READMEs exist at the root and in each
  workspace (commit 430c916). Keep them minimal — what the thing is, how to set
  up, how to run. EVERY remaining task dispatch must instruct the implementer to
  update the affected README as part of the task. app/README.md does not exist
  yet; Task 9 creates that workspace and must create its README too.
Implementers: sonnet. Reviewers: sonnet/opus scaled to diff risk. Controller: opus.

Pre-flight scan (before Task 1):
- Fixed in plan (commit a05859c): CDK Template assertions used vitest asymmetric
  matchers (expect.arrayContaining) which hasResourceProperties cannot match.
  Switched to Match.objectLike / Match.arrayWith in Tasks 6 and 7.
- Fixed in plan (commit a05859c): /__boom and /__throw routes moved out of
  createApp into the test that needs them, so production ships no deliberately
  failing endpoints.

Task 1: complete (commits a05859c..0ab2458, spec ✅, quality approved)
  Implementer agent: a4e1485555d316622
  Deviations accepted: root tsconfig.json with project references (required for
    `tsc --build`); package-lock.json (required for `npm ci` in CI).
  Resolved without fix round — reviewer flagged the report as overstating brief
    authorization for the root tsconfig. Reviewer was correct that the brief
    lacks that text, but the authorization came from the CONTROLLER'S DISPATCH
    PROMPT, which the reviewer never saw. Implementer misattributed the source;
    code is correct and unaffected. Report file is git-ignored scratch.
Task 1: minor (carried into Task 2, not deferred): vitest `passWithNoTests: true`
  is unconditional, so once real tests exist a broken `include` glob would show
  CI green with 0 tests run. Task 2 adds the first real tests — remove the flag
  there and confirm the count is non-zero. RESOLVED in Task 2 (commit 4e2e8bb).

Task 2: implementer commit 4e2e8bb (agent a7af867df75f43f69).
  Spec ✅. Implementer correctly caught that the brief's stated count of 10 was
  wrong (9 it-blocks); plan corrected in baf715c. `passWithNoTests` removed.
Task 2: PLAN BUG found by review — formatLength split feet from inches before
  rounding, so formatLength(23.999,'feet-inches') returned "1' 12\"" instead of
  "2'". Defect originated in the plan's own sample code, not the implementer.
  Plan corrected first (commit 5667bb6) so the code fix does not contradict it:
  round to display precision before splitting, plus a regression test.
Task 2: fix round 1/5 (1 addressed, 0 open; commits 5667bb6..a0a1ddb)
  Re-review hand-traced 23.999 -> "2'" and 11.999 -> "1'", confirmed the four
  pre-existing feet-inches cases unchanged, and proved remainder can never be
  exactly 12 after rounding (floor guarantees a strict <12 gap of >=0.01,
  vs ~1e-13 float error) — so no defensive guard is needed. No new breakage.
Task 2: complete (commits 0ab2458..a0a1ddb, review clean, 10 tests passing)

Task 3: complete (commits a0a1ddb..760c698, spec ✅, quality approved, 22 tests)
  Implementer agent: a4ee112c2c18b7cbb. Clean on first review pass.
  Verified: geometry.ts zero imports; toSvgY is the only Y-flip; overlaps uses
  strict < (edge contact is not overlap) and containsRect non-strict <= (flush
  edge contained); outerSize adds frameWidth*2.
Task 3: minor (deferred): Rect/Size carry an undocumented precondition that
  width/height are non-negative. Reviewer and implementer both judged runtime
  guards premature for a pure primitives module; a one-line JSDoc note would
  make the invariant explicit. Triage at final review.

Task 4: implementer commit c3454de (agent a01310b8000386aaa). Spec ✅, 14 tests.
Task 4: PLAN BUG found by review — z.infer resolves to zod's OUTPUT type, where
  a .default() field is REQUIRED, so `const b: CreateProject = {name:'x'}` fails
  to typecheck: exactly the omission the default exists to allow. Would have hit
  the API client and forms in later tasks. Defect originated in the plan's own
  code. Plan corrected first (commit 07f185a) so the fix does not contradict it:
  add PosterInput / CreateProjectInput as z.input aliases, plus two tests that
  only COMPILE if the aliases resolve to the input type.
Task 4: fix round 1/5 (1 addressed, 0 open; commit 042bb0d). Vacuity check
  passed: z.infer made typecheck FAIL with TS2741 (`visibility` missing),
  z.input made it pass — the new tests genuinely exercise input vs output.
Task 4: fix round 2/5 dispatched — implementer flagged that Wall.obstructions
  has the same .default([]) trap and was outside round 1's scope. Wall is
  central to Plan 2's CRUD work, so fixing rather than deferring. Plan updated
  first. Also asked the implementer to sweep for any remaining uncovered
  .default() fields so this stops being fixed one at a time.
Task 4: fix round 2/5 (1 addressed, 0 open; commits 07f185a..2ce8deb).
  Sweep verified independently by controller AND re-reviewer: 4 .default() sites
  across 3 schemas (Wall.obstructions, Poster.frameWidthIn, Poster.frameColor,
  CreateProject.visibility), all 3 owning schemas now have *Input aliases.
  Obstruction/Placement/Project have no defaults, correctly no alias.
  Output types (Wall/Poster/CreateProject via z.infer) supplemented, not
  replaced — existing parsed-type consumers unaffected.
Task 4: complete (commits 760c698..2ce8deb, review clean, 17 shared tests,
  39 total)
Task 4: OPERATIONAL NOTE (not a defect) — the three request-construction tests
  are COMPILE-TIME regressions only. Re-reviewer empirically reverted the
  aliases to z.infer: `tsc` failed with 3 errors (TS2741/TS2739) but
  `vitest run` still passed 17/17, because vitest transpiles via esbuild and
  never type-checks. `npm test` alone would NOT catch a regression here.
  CI already runs `npm run typecheck` (ci.yml, added Task 1), so the guarantee
  holds — but removing that step would silently disarm these tests. Worth
  keeping in mind for any future CI change.

Task 4: minor (deferred): Obstruction.label lacks .min(1) while Wall.name,
  Poster.name, Project.name all require it. Possibly intentional (unlabeled
  auto-placed obstructions) — needs a product call. Triage at final review.
Task 4: minor (deferred): no cross-schema validation ties obstruction/placement
  coordinates to wall widthIn/heightIn. Correctly out of scope for flat zod
  object schemas; belongs to a later composition/validation task in Plan 2.

Task 5: implementer commit 504e8d3 (agent a8b4e6eca8f501a29). Spec ✅, 5 api
  tests, 44 total. Declared 3 deviations; 2 accepted (root tsconfig reference
  to ./api — pre-authorized; @types/node devDependency — genuinely required
  for process/console).
Task 5: DEVIATION REJECTED by review — implementer added lib ["ES2023","DOM"]
  to api/tsconfig.json. api is a Lambda workspace; DOM makes window/document/
  localStorage typecheck in Node-only code. Reviewer proved experimentally that
  production code compiles with @types/node and no DOM; only app.test.ts needed
  it, because undici-types types Response.json() as Promise<unknown> rather
  than Promise<any>.
  Reviewer proposed excluding test files from tsconfig — CONTROLLER OVERRODE
  that: it would stop type-checking api tests, and Task 4 established tsc is
  the real gate for test-level guarantees. Chose a point-of-use cast instead,
  which keeps full type coverage and drops DOM.
  Plan corrected first (commit 87b7878), applied to Task 5 AND pre-emptively to
  Task 10, which has the same res.json() pattern.
Task 5: fix round 1/5 (1 addressed, 0 open; commits 87b7878..b45a6e9).
  Re-reviewer independently re-ran the two-way proof rather than trusting the
  report: scratch `document.getElementById` in app.ts -> tsc exit 2 with TS2304
  (HTMLElement) and TS2584 (document); removed -> exit 0. DOM genuinely gone,
  api tests still fully type-checked, working tree restored clean.
Task 5: complete (commits 2ce8deb..b45a6e9, review clean, 5 api tests, 44 total)

Task 6: implementer commit 282ced9 (agent a0c0a993307b85faf). Spec ✅, 5 infra
  tests, 49 total, cdk synth exit 0. NO DEPLOY performed (synth only, correct).
Task 6: TWO PLAN BUGS found by the implementer, both verified by the reviewer
  reverting them and reproducing the exact failure:
  (a) HttpLambdaIntegration id 'Default' -> constructs strips path components
      literally named "Default" when hashing logical IDs
      (constructs/lib/private/uniqueid.js), colliding with HttpApi's internal
      default-route construct. synth failed with SectionAlreadyContains:
      'ApiHttpApiDefaultRoute9B38A2A8'. Renamed to 'DefaultIntegration'.
  (b) `account: process.env.CDK_DEFAULT_ACCOUNT` violates
      exactOptionalPropertyTypes (TS2375). Conditional spread instead, so the
      key is absent (env-agnostic stack) rather than explicitly undefined.
  Plan corrected in 0e222ec.
Task 6: IMPORTANT finding — infrastructure/** was type-checked by NOTHING.
  tsc --build skips it (composite: false, cannot be a project reference);
  cdk synth runs bin/app.ts through tsx and vitest uses esbuild — both strip
  types without checking. Reviewer PROVED it: added `thisFieldDoesNotExist:123`
  to MainStack props, cdk synth still exited 0. Every CDK type error would ship
  silently, including exactly the class of bug (b) above.
  Fix: root typecheck script extended to
  `tsc --build && tsc -p infrastructure/tsconfig.json --noEmit`.
  Chose extending the root script over a separate CI step so one command covers
  the repo and local dev is protected too; CI already runs npm run typecheck.
Task 6: fix round 1/5 (1 addressed, 0 open; commits 0e222ec..15de5ea).
  Re-reviewer ran its own two-way proof: bogus prop -> TS2353 exit 2; removed
  -> exit 0. Critically it also ran `npx tsc --build` ALONE with the bogus line
  present and got exit 0, proving the new second half of the script is what
  catches it rather than the pre-existing half.
  Repeat-run question answered: no .tsbuildinfo interaction — tsc --build only
  writes buildinfo for referenced projects (never infrastructure), and the
  --noEmit pass emits nothing, so the halves share no mutable cache state.
Task 6: complete (commits b45a6e9..15de5ea, review clean, 49 tests, synth ok)

Task 7: complete (commit cc30649 impl + 6da9b6b doc fix; spec ✅, quality
  approved; 10 infra tests, 54 total, synth exit 0, NO DEPLOY)
  PROCESS ANOMALY worth recording: the first Task 7 dispatch was reported to
  the controller as user-rejected, but the agent had already been spawned and
  ran to completion, committing cc30649 at 15:17:48 — between Task 6's fix
  (15:11) and the README commit (15:20). A second dispatch then found the work
  done and verified rather than re-implementing; its phrase "already present
  before this session" was true from its own frame, not evidence of stale work.
  Confirmed via commit timestamps + reflog. Code reviewed as FRESH work after
  the fact (it had never been reviewed) and it held up.
  Verified: both buckets BLOCK_ALL public access behind CloudFront OAC;
  Cognito client generateSecret:false (no secret in a browser SPA); 403 AND 404
  both rewrite to /index.html 200; web bucket DESTROY vs images bucket RETAIN
  asymmetry correct, not reversed; ApiUrl/TableName outputs survived the
  constructor-body replacement; all six new outputs present.
Task 7: CONTROLLER DOC ERROR, self-inflicted and fixed (6da9b6b) — the README
  I wrote described lib/bootstrap-stack.ts and the PosterWallsBootstrap stack
  in the present tense, but neither exists until Task 8. Reworded as planned.
  Task 8 must flip it back to present tense once it actually builds them.
Task 7: minor (deferred): web.ts casts origins `as s3.IBucket`; redundant,
  since s3.Bucket already satisfies IBucket and withOriginAccessControl accepts
  a Bucket. Harmless, no widening to any, no suppressed error. Fold into the
  next touch of web.ts rather than spending a fix round.
Task 7: housekeeping — a stale git worktree (.git/worktrees/pre-task7) was left
  behind by an agent's non-destructive revert experiment and blocked git's own
  prune with a Windows permission error. Removed manually. Worth watching for
  if future agents use worktrees to test reverts.

Task 8: HUMAN APPROVED the full deploy (bootstrap + both stacks + gh secret)
  and chose AdministratorAccess with sub `repo:CrispyCabot/poster-walls-editor:*`
  (any branch) over restricting to main.
Task 8: SPLIT deliberately. Subagent does code+tests+synth only (Steps 1-4);
  the CONTROLLER performs the deploy (Steps 5-7). Rationale: the Task 7
  incident showed an interrupted dispatch can keep running, which is an
  unacceptable ambiguity for an irreversible billable operation.
Task 8: implementer commit 46dbdd0 (agent a5a71f142488df4ba). 13 infra tests,
  57 total, synth exit 0, BOTH stack templates present. Confirmed no deploy run.
Task 8: PLAN BUG found by the implementer — the test used
  Object.values(roles)[0], but the stack synthesizes TWO roles and the OIDC
  provider's custom-resource Lambda execution role (trusting
  lambda.amazonaws.com) is emitted FIRST. Verified by the controller directly
  against PosterWallsBootstrap.template.json. Plan corrected in 3029aee.
Task 8: fix round 1/5 (1 addressed, 0 open; commits 3029aee..0a274b7).
  Vacuity check: broken .find() needle -> fails cleanly at
  expect(deployRole).toBeDefined(); restored -> 13/13 pass.
Task 8: code review CLEAN — spec ✅, quality approved, SECURITY VERDICT "safe
  to deploy". Reviewer quoted the synthesized trust policy directly from
  PosterWallsBootstrap.template.json:
    Action: sts:AssumeRoleWithWebIdentity
    StringEquals aud = sts.amazonaws.com          (audience pinned)
    StringLike   sub = repo:CrispyCabot/poster-walls-editor:*
    Principal.Federated = the OIDC provider only
  Wildcard trailing-only; owner/repo fixed. ClientIDList ["sts.amazonaws.com"],
  Url https://token.actions.githubusercontent.com.
Task 8: minor (deferred): no unit test asserts roleName 'PosterWallsGithubDeploy'
  or the OIDC Url/ClientIDList literals directly — verified manually against the
  template instead. A hardening test could assert them explicitly.

=== DEPLOY LOG (controller-executed, human-approved) ===
15:41 cdk bootstrap aws://<acct>/us-east-1 -> CDKToolkit CREATE_COMPLETE (12/12)
15:43 cdk deploy PosterWallsBootstrap -> CREATE_COMPLETE (6/6), 57s
      Output DeployRoleArn = role/PosterWallsGithubDeploy
15:43 gh secret set AWS_DEPLOY_ROLE_ARN  (value never echoed; only length shown)
      gh variable set AWS_REGION = us-east-1
      Both confirmed present via gh secret list / gh variable list.
15:47 cdk deploy PosterWalls -> CREATE_COMPLETE (28/28), 226s
      Live checks: GET /health -> 200 {"status":"ok"} (0.83s cold);
      GET /nope -> 404 {"error":{"code":"not_found",...}} (error contract holds
      in production); CloudFront -> 403, expected until the SPA is uploaded.

Task 8: POST-DEPLOY DEFECT found by the controller reading the outputs — the
  Cognito domain prefix was `poster-walls-${Stack.of(this).account}`, putting
  the AWS account ID into a PUBLIC login URL that gets baked into the SPA
  bundle. Ironic given the plan-wide rule keeping the account ID out of every
  committed file: it was instead published to every visitor. Human approved
  fixing immediately (cheapest moment — zero users, no bookmarks).
  New prefix derives from the stack UUID:
    Fn.select(4, Fn.split('-', Fn.select(2, Fn.split('/', stackId))))
    -> poster-walls-0affce8adf47
Task 8: DEPLOY FAILURE + RECOVERY (worth remembering). First attempt at the
  prefix change failed: UPDATE_FAILED "Invalid request provided:
  AWS::Cognito::UserPoolDomain", stack went UPDATE_ROLLBACK_COMPLETE.
  Cause: a user pool holds only ONE Cognito-hosted domain, and CloudFormation
  replaces create-before-delete — so it tried to add the new domain while the
  old one still existed. NOT an invalid prefix (step 1 below proved the prefix
  resolves fine).
  Rollback restored the original domain, so login was never left broken —
  verified via describe-user-pool before doing anything else.
  Recovery = two deploys: (1) comment out addDomain -> old domain DELETED,
  49s; (2) restore addDomain with the new prefix -> created, 28s.
  Only the final state was committed; the temporary commented-out step never
  entered git. A comment in auth.ts now documents the two-deploy requirement.
Task 8: post-fix verification — stack UPDATE_COMPLETE; user pool domain is
  poster-walls-0affce8adf47; NO 12-digit number in any stack output;
  login endpoint returns 302 (live); cdk diff reports 0 stacks with
  differences (no drift); typecheck 0; 57/57 tests.
Task 8: complete (commits 6da9b6b..c8ecada, review clean, DEPLOYED + verified)

Task 9: complete (commits c8ecada..3b0db87, spec ✅, quality approved, 3 app
  tests, 60 total). Implementer agent: a43aad30bc0059c4a.
  Two deviations, both independently verified by the reviewer:
  (a) `app` was type-checked by NOTHING (noEmit + composite:false blocks it
      from tsc --build) — same gap class as Task 6's infrastructure. Fixed with
      a THIRD pass in the root script: tsc -p app/tsconfig.json --noEmit.
      Reviewer proved it: injected error, old two-pass script exited 0, new
      three-pass failed with TS2322. Gap was real.
  (b) vite downgraded 6 -> 5 because vitest@2.1.9 has a HARD dep on vite ^5.
      (Superseded immediately — see the version upgrade below.)
Task 9: minor (deferred): root README layout-table wording tweak was a drive-by
  edit outside the brief's file list. Trivial and accurate; disclosed.

=== HUMAN INSTRUCTION (after Task 9): upgrade EVERYTHING to latest stable, ===
=== and update local Node if needed.                                      ===
Node: upgraded 24.15.0 -> 24.18.0 LTS (Krypton) via winget OpenJS.NodeJS.LTS,
  npm 11.12.1 -> 11.16.0. Chose LTS over v26.5.0 Current deliberately: v26 is
  the Current line, not the production-stable one.
Latest published versions found (vs what the plan pinned):
  typescript      5.7.2  -> 7.0.2    MAJOR (native port)
  zod             3.24.1 -> 4.4.3    MAJOR (default()/input semantics at risk —
                                     Task 4's compile-time guarantees depend on
                                     exactly that behavior)
  vitest          2.1.8  -> 4.1.10   two majors
  vite            5.4.11 -> 8.1.5    three majors (removes the reason for the
                                     Task 9 vite downgrade entirely)
  @vitejs/plugin-react 4.3 -> 6.0.4
  @types/node     22     -> 26.1.1
  aws-jwt-verify  4.0.1  -> 5.2.1    MAJOR (affects Task 10, not yet built)
  react/react-dom 19.0   -> 19.2.8
  react-router-dom 7.1   -> 7.18.1
  hono            4.6.14 -> 4.12.32
  constructs      10.4   -> 10.7.1
  oidc-client-ts  3.1    -> 3.5.0
  tsx                    -> 4.23.1
  aws-cdk-lib already at 2.262.1 installed.
Inserted as Task 9b (upgrade) before Task 10, so Task 10 is written against
  aws-jwt-verify 5 rather than 4 and does not need immediate rework.

Task 9b: implementer commit 036ad99 (agent a30eb28ddd4115f13). Controller
  VERIFIED INDEPENDENTLY: typescript 7.0.2, zod 4.4.3, vitest 4.1.10, vite
  8.1.5 (single deduped install), react 19.2.8, hono 4.12.32,
  aws-jwt-verify 5.2.1; engines node >=24; three-pass typecheck script intact;
  typecheck exit 0; 60/60 tests across 7 files; build exit 0.
Task 9b: ZOD 4 PRESERVED the input/output distinction — all six vacuity checks
  passed (each *Input alias swapped to z.infer FAILS typecheck, restored to
  z.input PASSES). This was the highest-risk part of the upgrade, since the
  whole API contract rests on it.
Task 9b: cdk diff = ONLY the Lambda Code.S3Key bundle hash. Zero construct or
  config drift across a large aws-cdk-lib jump. Live infra unaffected.
Task 9b: implementer found a genuine TS7 regression on its own — automatic
  @types/node inclusion no longer reaches nested workspaces; added explicit
  "types": ["node"] to api and infrastructure tsconfigs.
Task 9b: CONTROLLER-FOUND GAPS (fix round dispatched, FIX_BASE a40da45):
  (1) IMPORTANT: ci.yml still pinned node-version: 22 while engines demanded
      >=24 — CI would have failed on npm ci. Would not have been caught until
      the next push.
  (2) IMPORTANT: Lambda still on NODEJS_22_X though NODEJS_24_X exists in the
      installed aws-cdk-lib. Bumped for consistency with "latest stable".
  (3) MINOR: README/version-fact accuracy sweep.
  Plan doc version strings realigned by the controller in a40da45.

=== HUMAN INSTRUCTION: "downgrade as needed so that necessary libraries are ===
=== supported" — prioritise supported/secure over newest.                  ===
npm audit found 2 high-severity items that `npm audit fix` cannot resolve:
  (a) react-router RSC-mode CSRF (GHSA-qwww-vcr4-c8h2), affecting 7.12.0-8.2.0.
      npm's only offer is downgrading react-router-dom to 7.11.0.
      CONTROLLER RESEARCH found a better answer: react-router CORE is published
      at 8.3.0 — ABOVE the affected range, i.e. the patched release. But
      react-router-dom stalled at 7.18.1 and never went to 8.x; in v7+ the DOM
      package is a compat shim and `react-router` is the supported import path.
      Peer deps of 8.3.0 (react >=19.2.7) are satisfied by our 19.2.8, and the
      app imports it in only 2 files. So: MIGRATE to react-router@8.3.0 rather
      than downgrade — clears the advisory AND stays latest stable.
  (b) brace-expansion bundled INSIDE aws-cdk-lib. Not fixable by us without an
      upstream release; asked the implementer for a reachability verdict rather
      than downgrading CDK for it.
Also asked the implementer for an honest read on whether TypeScript 7.0.2 (the
  new native port) is genuinely well-supported by vitest 4 / vite 8 /
  aws-cdk-lib / tsx, or whether we are early-adopting something that will keep
  costing us. One TS7 regression already surfaced. No version change yet —
  assessment first.
  Assessment came back: "workable but genuinely early-adopter, not
  battle-tested like 5.x." HUMAN APPROVED stepping back.

Task 9b: RESOLVED, three follow-up commits:
  9e2175a  ci.yml node-version 22 -> 24; Lambda NODEJS_22_X -> NODEJS_24_X
           (test assertion 'nodejs22.x' -> 'nodejs24.x')
  eed491d  react-router-dom REMOVED entirely, react-router@8.3.0 added.
           Migrating FORWARD to the patched release rather than taking npm
           audit's advice to downgrade to 7.11.0. Two import sites updated.
  1acccfc  typescript 7.0.2 -> 5.9.3 (latest of the 5.x line; chose 5.x over
           6.0.3 because 6.0 is a bridge release carrying 7's semantics and
           therefore much of the same early-adopter risk).
           The "types": ["node"] workaround was EMPIRICALLY CONFIRMED
           unnecessary on 5.9.3 and removed — proving it was a TS7-only
           regression, and leaving no unexplained residue.
Task 9b: review CLEAN — spec ✅, quality approved. Reviewer INDEPENDENTLY
  reproduced every proof rather than trusting the report:
    zod input/output guarantee SURVIVED both zod 3->4 and TS 7->5.9.3:
      CreateProjectInput -> z.infer  = TS2741 (visibility missing)
      PosterInput        -> z.infer  = TS2739 (frameWidthIn, frameColor)
      WallInput          -> z.infer  = TS2741 (obstructions)
    exactOptionalPropertyTypes still enforced = TS2375
    both extra typecheck passes still catch injected errors = TS2322 each
    single vite (8.1.5); no react-router-dom anywhere
  Reviewer also independently searched infrastructure/ for exclude/glob/
  fromAsset/BucketDeployment/bundling and confirmed brace-expansion is NOT
  REACHABLE — the only asset-producing construct is NodejsFunction with
  bundling {minify, sourceMap} and no exclude glob, so every pattern reaching
  minimatch is a hardcoded CDK default, never external input.
Task 9b: complete (commits 3b0db87..1acccfc, review clean, 60 tests)
Task 9b: CI VERIFIED GREEN ON LINUX after push — npm ci, typecheck, test,
  build, cdk synth all passed on Node 24. This is the first CI run since the
  upgrade and the real cross-platform proof.
Task 9b: minor (deferred): report reads self-contradictory on a skim because
  superseded sections were left in place rather than edited. Audit trail is
  correct; cosmetic only.

Task 10: complete (commits d1799b7..cd960fa, spec ✅, SECURITY safe, quality
  approved; 10 api tests, 65 total). Implementer agent: a7d91538393e79dc7.
Task 10: PLAN BUG found by the implementer — cognitoVerifier() called
  CognitoJwtVerifier.create() EAGERLY in the function body. createApp()
  evaluates `deps.verify ?? cognitoVerifier()` unconditionally, so every test
  built a real verifier with USER_POOL_ID unset, which throws SYNCHRONOUSLY.
  My own comment said "built once per container" but the code did not defer.
  Reviewer reproduced it exactly: eager form -> "5 failed | 5 passed",
  Error: Invalid Cognito User Pool ID, from parseUserPoolId -> create ->
  cognitoVerifier -> createApp. Memoized form -> 10 passed.
  Plan corrected in cd960fa.
  Reviewer also judged the memoization itself safe: buildVerifier() is fully
  synchronous so `verifier ??= buildVerifier()` cannot interleave on Lambda's
  single-threaded loop, and a throw never commits the assignment, so a failed
  first build retries rather than poisoning the memo.
Task 10: security verified — 401 on missing header, non-Bearer scheme, and
  invalid token; the underlying verifier error ('bad token') never reaches the
  client, only 'Invalid token'; production path passes userPoolId AND clientId
  AND tokenUse:'access' (omitting clientId would accept tokens minted for a
  different app client); /me returns only sub+username, no invented email;
  /health unauthenticated, /me genuinely behind requireAuth.
Task 10: minor (deferred): a misconfigured USER_POOL_ID in production now
  surfaces as a generic 401 on the first real /me call rather than a loud
  cold-start crash — an OBSERVABILITY REGRESSION introduced by the lazy fix.
  Worth logging on first-build failure. Triage at final review.
Task 10: minor (deferred): nothing tests cognitoVerifier() itself, so the
  clientId/tokenUse wiring is verified by inspection only. Inherent to the
  injected-verifier design, but a residual coverage gap.
Task 10: minor (deferred): `c as unknown as { get(k:'user'): AuthedUser }` in
  app.ts is plan-mandated and safe (requireAuth always sets user before
  next()), but a properly typed Hono generic would be better.

Controller follow-up (d1799b7): CI annotated that actions/checkout@v4 and
  actions/setup-node@v4 target the deprecated Node.js 20 and are being forced
  onto Node 24. Latest majors are checkout v7, setup-node v7,
  configure-aws-credentials v6. Plan updated; TASK 11 must apply the bump to
  BOTH ci.yml and the new deploy.yml (added to Task 11's Files list).

Task 11 SPLIT: 11a = write deploy.yml + bump ci.yml actions (subagent, commit
  locally, NO PUSH — controller controls when the deploy fires).
  11b = controller pushes, watches the deploy, then HUMAN verifies signup in a
  browser with a real email. 11b cannot be automated.
Task 11a: implementer commit 75a2b77 (agent aa4b47de89be8e7bd), NOT pushed.
  Spec ✅, quality approved. Reviewer verified every describe-stacks output key
  against the LIVE stack (no typos — a typo would yield an empty string and
  silently bake blank VITE_* config into the SPA), confirmed VITE_* names match
  app/src/config.ts, and checked ordering/permissions/concurrency/action
  versions/GITHUB_OUTPUT mechanics.
Task 11a: MAJOR ASSUMPTION INVALIDATED by the reviewer — **CI does not gate the
  deploy.** It checked branch protection directly:
    gh api repos/{owner}/{repo}/branches/main/protection -> 404 "not protected"
  ci.yml and deploy.yml are INDEPENDENT workflows both triggered on push to
  main, with no `needs:` relationship. A RED CI RUN WOULD NOT STOP A DEPLOY TO
  PRODUCTION. The controller had been describing CI as the gate; it was not.
Task 11a: IMPORTANT — the CDK synth test is flaky and MORE likely to fail on CI
  than locally. NodejsFunction triggers synchronous esbuild bundling inside
  synth(); no testTimeout exists anywhere in the repo so vitest's default
  5000ms applies; GitHub's ephemeral runners start cold every run, whereas the
  implementer's passing rerun had a warm disk cache. Diagnosed correctly by the
  implementer but treated as resolved by a passing rerun rather than fixed.
Task 11a: fix round 1/5 dispatched (FIX_BASE 75a2b77) covering:
  (1) real fix for the flaky test (testTimeout 20000 or a beforeAll pre-warm),
      with a demanded COLD-run duration measurement, not just "it passes now";
  (2) restructure deploy.yml into verify + deploy jobs with `needs: verify`, so
      the deploy SELF-GATES rather than depending on repo branch-protection
      settings someone could later change. id-token: write scoped to the deploy
      job only — verify does not need it. ci.yml stays for pull requests.
  (3) infrastructure/README.md:32 still claims PosterWallsBootstrap is not
      deployed; it is. Correct to present tense.
Task 11a: reviewer's predicted most-likely first-run failure = OIDC role
  assumption (sts:AssumeRoleWithWebIdentity) sub-claim mismatch, since that path
  has never executed end to end. Watch for it on the first push.
Task 11a: fix round 1/5 (3 addressed, 0 open; commits 75a2b77..447cd0a).
  Cold-run measurement demanded and delivered: slowest test 5057ms vs the old
  5000ms default — the diagnosis quantified, not guessed. testTimeout raised to
  20000. deploy.yml split into verify -> deploy with `needs:`, id-token:write
  scoped to deploy only. README corrected to present tense.
  Re-reviewer caught a factual error in the implementer's own rationale
  (hookTimeout defaults to 10s, not 5s) while confirming the conclusion still
  holds for an independent reason (every it() calls synth() separately, so one
  beforeAll pre-warm would not have covered the rest).

=== TASK 11b: FIRST PRODUCTION DEPLOY VIA GITHUB ACTIONS ===
Attempt 1 (run 30220874462): verify job PASSED (the new gate works), deploy job
  FAILED at configure-aws-credentials@v6:
  "Could not assume role with OIDC: Not authorized to perform
   sts:AssumeRoleWithWebIdentity" — 12 retries, then gave up.
  EXACTLY the failure the Task 11a reviewer predicted.
Diagnosis: everything on the AWS side checked out — provider registered with
  ClientIDList ["sts.amazonaws.com"], correct Url, trust policy aud+sub
  conditions present, role ARN length matching the real ARN. STS gives no hint
  about WHICH condition failed, so guessing was unproductive.
  Wrote a temporary workflow (.github/workflows/oidc-debug.yml) to fetch the
  GitHub OIDC token and print only its non-secret claims. ROOT CAUSE:

    actual sub: repo:CrispyCabot@18431358/poster-walls-editor@1312969424:ref:refs/heads/main
    policy had: repo:CrispyCabot/poster-walls-editor:*

  GitHub emits OIDC subjects using IMMUTABLE IDENTIFIERS — numeric owner and
  repo IDs appended — not the plain repo:<owner>/<repo> form that essentially
  every example and the plan assumed. Verified the IDs against the GitHub API
  (owner_id 18431358, repo_id 1312969424).
  Fix pins the numeric IDs, which is STRONGER than name matching: a rename or a
  same-name impostor repo cannot satisfy it.
  Plan corrected (e358fe2), code + test + README corrected (793b11f), debug
  workflow deleted. Implementer proved the test fails against the OLD pattern,
  so there is now an automated guard against regressing to a silently
  never-matching form.
  Bootstrap stack redeployed locally FIRST (trust policy must be fixed before
  GitHub tries to assume the role), then pushed.
Attempt 2 (run 30221309573): FULL SUCCESS. verify -> deploy, every step green:
  configure-aws-credentials, cdk deploy, read outputs, build SPA, publish,
  invalidate.
Live verification after deploy:
  SPA root                     -> HTTP 200
  SPA deep link /callback      -> HTTP 200 (403->index.html rewrite works)
  GET /health                  -> {"status":"ok"}
  GET /me (no token)           -> 401 {"code":"unauthorized","Missing bearer token"}
  GET /me (junk token)         -> 401 {"code":"unauthorized","Invalid token"} (no leak)
  Lambda runtime               -> nodejs24.x (runtime bump applied)
  SPA bundle contains the REAL api + cognito URLs and client id, not blanks —
  proving the two-phase build wired stack outputs in correctly.
APP URL: https://d12a9gq33m9h8u.cloudfront.net
Task 11b: COMPLETE. Human signed up with a real email, verified, signed in, and
  confirmed "API confirmed identity" persisted across a refresh. Controller
  corroborated: Cognito pool holds one user, status CONFIRMED, email_verified
  true. This is the only proof the browser's access token is accepted
  server-side, and it passed.

=== FINAL WHOLE-BRANCH REVIEW (opus) ===
Verdict: READY TO BUILD ON = yes. No rework suggested.
Independently verified by the reviewer: layout-engine purity holds (zero
  imports); toSvgY is the ONLY Y-inversion in the entire repo; the three-pass
  typecheck closes two real holes; IAM/S3/Cognito posture correct and in places
  stronger than the plan required; deploy self-gating is load-bearing because
  main is genuinely unprotected; READMEs accurate against the code.

CRITICAL FINDING — AWS account ID in PUBLIC git history (commit a63f54b, the
  spec doc, first commit). Redacted later in 6919570, but git keeps both.
  ROOT CAUSE OF THE MISS: the plan's own Definition of Done ran
  `git grep '[0-9]\{12\}'` against the WORKING TREE only. It passed the whole
  time while the leak sat in history. The constraint said "never appear in any
  committed file" — the file WAS committed, then edited. Wrong surface checked.
  LESSON: a "must never be committed" constraint must be verified against
  history (git log -S / git rev-list sweep), not the working tree.
  Reviewer swept all history for AKIA keys, secrets, private keys: nothing else.
  RESOLUTION (human chose): rewrite history. Installed Python 3.14.6 +
  git-filter-repo 2.47.0, took a full bundle backup first, rewrote all 45
  commits with --replace-text, force-pushed.
  RESIDUAL, ACCEPTED BY HUMAN: GitHub still serves the orphaned commit a63f54b
  by exact SHA — a force-push drops the ref but only GitHub can gc unreferenced
  objects. Verified still fetchable. Practical exposure low: no ref points to
  it, it is not discoverable by browsing or search, and the ID is not a
  credential (the deploy role's trust policy is pinned to the repo's immutable
  numeric ID + aud, so it is not assumable). Human declined the GitHub Support
  purge and the delete/recreate option. NOTE for anyone revisiting: deleting and
  recreating the repo would mint a NEW repo ID and break the OIDC trust policy
  until bootstrap-stack.ts is updated and redeployed.

FOUR FIXES APPLIED before closing (commit 85159b5, all human-approved):
  1. AuthProvider never subscribed to oidc-client-ts events, so React held an
     expired token while localStorage held a fresh one — every future API call
     would 401 after ~1h with only a reload as the cure. Now subscribes to
     addUserLoaded/addUserUnloaded/addSilentRenewError with cleanup, and gates
     signed-in on !expired. jsdom via per-file pragma, NOT a config
     restructure (that conversion stays deferred).
  2. ZodError fell through to a generic 500, violating the spec's error table.
     Now 400 validation_error, with issues logged server-side only — the body
     must not echo submitted values back.
  3. Verifier construction failure was indistinguishable from a bad token.
     Now logged loudly before rethrow; memo still not poisoned on failure.
  4. CloudFront /i/* mapped to key i/*, but the image pipeline writes under
     uploads/<uuid>/ — nothing it wrote was reachable. originPath '/uploads'
     added so the spec's documented URL shape resolves. Guarded by a test.
  Re-review: all four ADDRESSED, verified by reverting each and confirming its
  test fails. LIVE-TRAFFIC RISK: none — /i/* already 404s today, so the change
  only makes previously-broken URLs work.
  Tests 65 -> 72.

POST-REWRITE VERIFICATION (deploy run 30227887463, green):
  SPA root 200; deep link 200; /health ok; /me no token 401 "Missing bearer
  token"; /me junk token 401 "Invalid token"; CloudFront OriginPath /uploads
  applied; Cognito user still CONFIRMED. 72/72 tests, typecheck 0.

=== CARRY-FORWARD INTO PLAN 2 (reviewer-triaged, none blocking) ===
Do these first, before feature work multiplies them:
  - Thread the Hono env generic through createApp so `c.get('user')` is typed,
    instead of `c as unknown as {...}`. Cheap once; twelve casts if deferred.
  - vitest.config.ts needs a projects split for jsdom component tests; the
    per-file pragma was a deliberate stopgap.
Carry, decide when the relevant UI exists:
  - Rect/Size non-negative precondition undocumented (JSDoc when next touched).
  - Obstruction.label lacks .min(1) — product call at form-build time.
  - Cross-schema coordinate validation belongs in layout-engine detectIssues(),
    NOT the schemas; the spec deliberately allows out-of-bounds while dragging.
  - Redundant `as s3.IBucket` casts in web.ts.
  - No test for cognitoVerifier() itself (hard without a live pool).
  - Unit-suffix naming inconsistent (widthIn vs width/centerX). Zero rows exist
    in DynamoDB right now — this is the LAST moment the change is free.
Infra hygiene:
  - logRetention provisions an extra Lambda, role, and a logs:* on Resource "*";
    switch to an explicit LogGroup. Removes 3 resources and 2 synth warnings.
  - No responseHeadersPolicy on CloudFront; SECURITY_HEADERS is one line and the
    SPA stores tokens in localStorage.
  - useCustomDomain is a DEAD FLAG — declared, passed, read by nothing. Setting
    it true silently does nothing. Wire it in Plan 4 or delete it.
  - localhost:5173 is a callback URL on the PRODUCTION Cognito client.
  - imagesBucket CORS allows PUT from '*'; narrow to WEB_ORIGIN.
  - ApiError's status union includes 418 purely for a test fixture.
  - brace-expansion advisory inside aws-cdk-lib: not reachable, recheck on the
    next CDK bump.
Task 6: minor (deferred): CDK deprecation warnings on every synth
  (logRetention, encryptedResource/policyResource). Harmless now; worth a
  follow-up once the resource set stabilizes. Triage at final review.

