# @pwe/infrastructure

Every AWS resource this project uses, as [CDK](https://docs.aws.amazon.com/cdk/)
v2 in TypeScript. Nothing is created by hand in the console.

Everything lives in **one stack in `us-east-1`**. CloudFront requires its
certificate in us-east-1 regardless of where the rest of the stack sits, so
putting it all there avoids a second stack and cross-region references.

## Layout

```
bin/app.ts              entrypoint; instantiates the stacks
lib/
  main-stack.ts         composes the constructs below
  bootstrap-stack.ts    GitHub OIDC provider + deploy role
  constructs/
    data.ts             DynamoDB table
    api.ts              Lambda + API Gateway HTTP API
    web.ts              S3 buckets + CloudFront
    auth.ts             Cognito user pool and client
test/                   synth assertions
```

## Stacks

| Stack | Deployed by | Contains |
|---|---|---|
| `PosterWalls` | GitHub Actions on push to `main` | the application |
| `PosterWallsBootstrap` | by hand, once, from a local admin identity | the GitHub OIDC provider and the deploy role |

`PosterWallsBootstrap` is deployed by hand, once. GitHub Actions cannot
deploy it, because it is what grants GitHub the ability to deploy anything.

## Commands

```bash
npx cdk synth --quiet     # generate templates; no AWS access needed
npx cdk diff              # compare against what is deployed
npx cdk deploy PosterWalls --require-approval never
```

`cdk.out/` is generated and git-ignored.

## Type checking

This workspace sets `composite: false`, so it is **not** a `tsc --build`
project reference. The root `typecheck` script covers it with a separate
`tsc -p infrastructure/tsconfig.json --noEmit` pass.

Do not rely on `cdk synth` or the tests to catch type errors — `cdk synth` runs
through `tsx` and vitest runs through esbuild, and both strip types without
checking them. Run `npm run typecheck` from the repo root.

## Notes

- The custom domain is behind a config flag and currently **off**. The app is
  served from the CloudFront URL until DNS is delegated.
- The construct id for the API's default integration must not be `Default` —
  `constructs` strips path components with that name when hashing logical IDs,
  which collides with the HttpApi's own default route and breaks synth.
- The API Lambda gets an explicit `logs.LogGroup` (one-month retention,
  `RemovalPolicy.DESTROY`) passed via the `logGroup` prop, not the deprecated
  `logRetention` option. `logRetention` synthesizes a second Lambda, IAM role,
  and `Custom::LogRetention` resource just to set a retention policy, and its
  handler asset periodically gets corrupted by OneDrive on this machine
  (`EINVAL: invalid argument, readlink`), taking out every infra test until
  `npm ci` is re-run. The explicit `logGroup` is deliberately left unnamed:
  the function's original auto-created group (`/aws/lambda/<function-name>`)
  already exists in production, and giving the new `LogGroup` that same name
  would make CloudFormation try to CREATE it and fail with "already exists".
  Leaving the name unset lets CloudFormation generate a fresh, non-colliding
  name; the old group is simply orphaned (stops getting new log entries).
- Poster images use `RemovalPolicy.RETAIN`; deleting them would break saved
  arrangements and any share link already handed out.
- GitHub's OIDC `sub` claim uses immutable numeric IDs, not plain names:
  `repo:<owner>@<ownerId>/<repo>@<repoId>:ref:...`. The trust policy is pinned
  to `githubOwnerId`/`githubRepoId` for this reason — matching only the plain
  name form silently never matches, and a rename or impersonation risk is
  avoided as a side benefit.

## Testing

From the repo root:

```bash
npx vitest run infrastructure
```

These are synth assertions — they build templates in memory and never touch AWS.
