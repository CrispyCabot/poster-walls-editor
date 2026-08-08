# Security and cost controls

The app is open to the public: anyone can sign up, and a signed-in account can
create projects and upload images that cost real money to store and serve. This
document records what protects against that today, how the per-account limits
actually work, and what is still missing.

Written 2026-08-08, against the state of the repo at that date.

---

## Part 1 — How limits work today

### Where the code lives

[`api/src/db/limits.ts`](../api/src/db/limits.ts) defines the ceilings. It runs
inside the API Lambda — the `Api/Fn` function in the `PosterWalls` stack, in
`us-east-1`. There is nothing separate deployed for it; it is a module that runs
in the same process as every request handler.

### Where the data lives

Two places, and the distinction matters when you want to change something:

**The defaults** are compiled into the Lambda bundle. `DEFAULT_LIMITS` is a
constant in the source, so changing it means a deploy.

```ts
export const DEFAULT_LIMITS: Limits = {
  projects: 25,
  postersPerProject: 200,
  wallsPerProject: 25,
  uploadBytes: 15 * 1024 * 1024,  // 15 MB
  images: 500,
};
```

**The per-user overrides** live in DynamoDB, as a `limits` map attribute on the
user's PROFILE item in the single table:

```
PK = USER#<cognito-sub>
SK = PROFILE
```

That item is the whole override mechanism. `limitsFor(sub)` does one `GetItem`
against it, merges any `limits` map it finds over the defaults, and returns the
result. Per the key layout in
[`packages/shared/src/keys.ts`](../packages/shared/src/keys.ts), this is the same
partition that holds the user's project index entries.

### The important caveat: the PROFILE item does not exist yet

Nothing in the codebase writes a PROFILE item. `limitsFor` is its only reader,
and signup does not create one — there is no Cognito post-confirmation trigger.

So today, for every user, that `GetItem` returns nothing, `overrides` is `{}`,
and everyone gets `DEFAULT_LIMITS`. This is not a bug — the merge handles a
missing item cleanly — but it means **raising a limit is a create, not an
update**, and any tooling written against this should not assume the item is
there.

### The merge is deliberately strict

```ts
if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
  merged[key] = value;
}
```

Anything that is not a finite, non-negative number is ignored, silently. A typo
that writes the string `"5000"` instead of the number `5000` will leave the
default in place with no error anywhere. Worth knowing when a limit change
appears to have had no effect — read the item back and check the type.

Unknown keys in the map are ignored too; the loop iterates over the keys of
`DEFAULT_LIMITS`, not over what it found.

### Raising the limits for one user

**Step 1 — get the table name.**

```bash
TABLE=$(aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
```

**Step 2 — get the user's Cognito sub.** The sub is the partition key, not the
email address. The pool signs in by email alias, so filter on that:

```bash
POOL=$(aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

aws cognito-idp list-users --user-pool-id "$POOL" \
  --filter 'email = "someone@example.com"' \
  --query 'Users[0].Attributes[?Name==`sub`].Value' --output text
```

**Step 3 — make sure the `limits` map exists.** This is a separate call because
DynamoDB rejects an update expression that both creates a map and writes a key
inside it — the two document paths overlap, and it errors rather than ordering
them for you.

```bash
aws dynamodb update-item --table-name "$TABLE" \
  --key '{"PK":{"S":"USER#<sub>"},"SK":{"S":"PROFILE"}}' \
  --update-expression 'SET #l = if_not_exists(#l, :empty)' \
  --expression-attribute-names '{"#l":"limits"}' \
  --expression-attribute-values '{":empty":{"M":{}}}'
```

`update-item` creates the PROFILE item if it is absent, which — given the
caveat above — is the normal case.

**Step 4 — set the ceiling you want.**

```bash
aws dynamodb update-item --table-name "$TABLE" \
  --key '{"PK":{"S":"USER#<sub>"},"SK":{"S":"PROFILE"}}' \
  --update-expression 'SET #l.#k = :v' \
  --expression-attribute-names '{"#l":"limits","#k":"images"}' \
  --expression-attribute-values '{":v":{"N":"5000"}}'
```

Repeat step 4 per key. Valid keys are exactly the fields of `Limits`:
`projects`, `postersPerProject`, `wallsPerProject`, `uploadBytes`, `images`.

The change takes effect on the very next request. `limitsFor` reads the item on
every call and nothing caches it — no deploy, no invalidation, no restart.

Avoid `put-item` here. It works today only because nothing else writes to
PROFILE, and it will silently destroy the rest of the item the moment that
stops being true.

### Reading back what a user has

```bash
aws dynamodb get-item --table-name "$TABLE" \
  --key '{"PK":{"S":"USER#<sub>"},"SK":{"S":"PROFILE"}}'
```

An empty response means no overrides — that user is on the defaults.

### Lowering a limit, or removing an override

```bash
aws dynamodb update-item --table-name "$TABLE" \
  --key '{"PK":{"S":"USER#<sub>"},"SK":{"S":"PROFILE"}}' \
  --update-expression 'REMOVE #l.#k' \
  --expression-attribute-names '{"#l":"limits","#k":"images"}'
```

Note that limits are checked at creation time only. Lowering `projects` below
what a user already has does not delete anything; it just stops them making
more.

### What actually enforces them

This is the part worth being clear-eyed about. `assertUnder` is called in
exactly one place — [`api/src/routes/projects.ts`](../api/src/routes/projects.ts),
on project creation:

| Limit | Enforced? |
| --- | --- |
| `projects` | Yes — `POST /projects` |
| `postersPerProject` | **No** |
| `wallsPerProject` | **No** |
| `uploadBytes` | **No** |
| `images` | **No** |

Four of the five are declared constants that nothing reads. The mechanism is
built and correct; it is simply not wired to the routes that spend money. That
is item 1 below.

When a limit does trip, `LimitExceededError` is caught in the route and
re-thrown as an `ApiError` with status 429. That mapping is per-route rather
than central, so any new call site has to do the same translation or the error
surfaces as a 500.

---

## Part 2 — What is already right

Worth stating, so none of it gets removed by accident:

- **Uploads bypass Lambda.** The browser PUTs straight to S3 with a presigned
  URL, so image bytes never pass through the function or get billed twice.
- **Ownership is checked before an upload URL is minted.** Without it, anyone
  could spend another user's storage allowance.
- **Image keys are unguessable UUIDs.** The URL is the capability.
- **Presigned URLs expire in 300 seconds.**
- **Both buckets block all public access** and are served only through
  CloudFront with Origin Access Control.
- **GSI1 is sparse**, so private projects are physically absent from the browse
  index rather than merely filtered out of it.
- **401s are opaque** and `preventUserExistenceErrors` is on, so the login flow
  does not confirm which emails have accounts.
- **Zod errors never echo the submitted value back** to the client; they go to
  CloudWatch only.
- **DynamoDB has point-in-time recovery**, and the table, images bucket, and
  user pool are all `RETAIN`.

---

## Part 3 — Gaps, worst first

### 1. Four of the five limits do nothing

Covered above. `images` is the one that matters most — it is the only ceiling on
total stored objects, and it is inert.

Enforcing `images` needs a counter, because there is nothing to count against
today. The counter has to increment when the upload URL is **minted**, not when
the upload completes, because the API never finds out whether the PUT happened.
An atomic `ADD imageCount 1` with a `ConditionExpression` on the PROFILE item
does it in a single write and fails closed.

Failing closed has a consequence to accept deliberately: mint 500 URLs and use
none, and the account is locked out until something reconciles the count against
reality. For an app at this scale that is the right trade — the alternative
leaks storage.

### 2. The presigned PUT has no size cap

[`api/src/routes/posters.ts`](../api/src/routes/posters.ts) signs a
`PutObjectCommand` with only `Bucket`, `Key`, and `ContentType`. Nothing
constrains the body, so that URL will accept a multi-gigabyte object.
`uploadBytes: 15 * 1024 * 1024` is currently a comment, not a control.

Two fixes:

- **`createPresignedPost`** (`@aws-sdk/s3-presigned-post`) supports a
  `content-length-range` condition that S3 enforces server-side. Correct, but it
  means moving the client to `FormData` and changing the bucket CORS from `PUT`
  to `POST`.
- **Sign `ContentLength` on the existing PUT.** S3 then requires the client to
  match it exactly. Less flexible — the client must know the size up front,
  which it does — but roughly ten lines and no infrastructure change.

The second is the better first move.

### 3. Deleting a poster does not delete its image

`removePoster` touches DynamoDB only. The S3 object stays forever, and the image
count (once it exists) never comes back down. Storage grows monotonically even
for a user who tidies up after themselves.

Needs a best-effort `DeleteObject` plus a decrement, and ideally a reconciliation
sweep for objects orphaned by an upload that was never attached to a poster.

### 4. `imageKey` accepts arbitrary strings

[`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts) declares it
as `z.string().optional()`, and the API never verifies that a key it is asked to
store is one it actually issued. A client can write anything there — a 200 KB
string, or another user's key if it was ever observed.

Constrain it to the shape the API mints:

```ts
imageKey: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/).optional(),
```

### 5. No throttling on the request path

The HTTP API has no stage-level throttle, so it inherits the account default of
10,000 rps. A loop against `POST /projects/:id/posters/upload-url` costs Lambda
invocations and DynamoDB reads at whatever rate the caller can sustain, entirely
independently of whether any image is ever uploaded.

`defaultRouteSettings` with a modest rate and burst on the `HttpApi` is a
two-line change in [`infrastructure/lib/constructs/api.ts`](../infrastructure/lib/constructs/api.ts).

### 6. S3 will serve whatever bytes it is given

S3 does not inspect content — it trusts the `ContentType` the URL was signed
with. An HTML page uploaded as `image/png` becomes a durable, cached URL on
`poster-editor.chrisbridewell.dev`. That is a phishing-hosting problem, not just
a cost problem, and it is made quieter by the SPA error rewrite that turns 403
and 404 into a 200.

Attach a CloudFront response headers policy to the `/i/*` behaviour with
`X-Content-Type-Options: nosniff` and a `default-src 'none'` CSP.

### 7. Signup is unrestricted

`selfSignUpEnabled: true` with no gate. Per-account limits only work if accounts
are costly to obtain, and right now a script can register 500 of them and
multiply every ceiling in this document by 500.

A `PreSignUp` Lambda trigger is the lever — reject disposable-email domains, or
require an invite code while the app is small.

One related detail: Cognito's built-in email sender is capped around 50 messages
per day. That throttles a signup flood, but it also means a flood locks out
legitimate signups until the window resets. Moving to SES removes the cap and
the ceiling both, so it should come with the trigger rather than instead of it.

### 8. The images bucket allows all CORS origins

`allowedOrigins: ['*']` in
[`infrastructure/lib/constructs/web.ts`](../infrastructure/lib/constructs/web.ts).
The presigned URL is the real capability, so this is not a hole by itself, but
pinning it to the actual app origins costs nothing.

---

## Part 4 — Backstops

Everything above assumes the application logic is correct. These catch the case
where it is not, and none of them depend on it:

- **An AWS Budget with an SNS alert.** Free for the first two budgets. This is
  the highest value-per-minute item in the document — it is the thing that
  actually raises the alarm when something unanticipated happens.
- **Lambda reserved concurrency** on `Api/Fn`, around 20. Caps invocation cost
  and blast radius with one property.
- **DynamoDB max on-demand throughput** —
  `Billing.onDemand({ maxReadRequestUnits, maxWriteRequestUnits })` puts a real
  ceiling on the one resource that presently has none.
- **An S3 lifecycle rule** aborting incomplete multipart uploads after a few
  days, so partial uploads stop accruing storage charges invisibly.

WAF is deliberately not on this list. It is $5/month plus per-rule and
per-request charges to address something API Gateway throttling handles for free
at this scale. Revisit if the app ever attracts deliberate attention.

---

## Suggested order

1. AWS Budget with an alert — do this first, it is a few minutes of work.
2. Enforce `images` with an atomic counter at mint time.
3. Cap upload size.
4. Lambda reserved concurrency and DynamoDB max throughput.

That closes the runaway-bill scenario. Then: the `imageKey` regex, S3 deletion
on poster delete, API throttling, the response headers policy, and the
`PreSignUp` trigger.
