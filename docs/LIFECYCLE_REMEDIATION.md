# Lifecycle repair deployment contract

## Apply order

This change is not an automatic production migration. Back up the database and shared drawing volume, then apply `009_project_lifecycle.sql` and `010_billing_lifecycle.sql` to staging before deploying the matching API. The same order is required in production. Missing RPCs fail closed; do not deploy the API against an old schema.

Migration 009 deliberately moves legacy `approved` labels to `review`: those records lack proof of approval for a particular revision. Export the affected project list first and arrange a new review. New approval requires a different owner/editor as reviewer. Changes to names, descriptions or linked calculations invalidate the approval. Ordinary PATCH updates cannot set `review` or `approved`; use `requestApproval` and `approveProject` actions. The action caller is always the server-verified user, not a supplied user ID.

Project creation plus its first owner membership is one transaction. An optional UUID `Idempotency-Key` identifies retries; reuse it only with identical name and description. Project lists are bounded (`limit` 1–100, `offset` 0–100000) and return `pagination.nextOffset`. The UI follows pages and resets the offset on a filter change. List summaries use one DB RPC and do not materialize every calculation or member row.

## Access withdrawal

Removing a member or downgrading an owner/editor revokes their existing share links through a database trigger. Rejoining does not reactivate those grants. Link reads additionally verify the issuer's current editing membership. Owners may invoke `listShareLinks` and `revokeShareLinks` (optional `linkId`; omitted means all project links). The metadata listing never returns passwords or hashes. Revocation controls future server requests, not copies already downloaded by recipients. This is intentionally stricter than the previous bearer-link lifecycle.

## Drawing recovery and retention

Analysis executions carry a unique run token, a 90-second renewable lease and a 20-second heartbeat. A stale active run can be reclaimed, and every analysis write checks the matching unexpired token. Initial jobs recover through `run`; jobs with partial documents recover through `resume`. A cancelled job is never reclaimed. The execution timeout remains 30 minutes. If filesystem heartbeat renewal fails, abort rather than extend an unverified execution.

Corrupt temporary source records are quarantined inside the lease directory; their contents and credentials are not logged. Authenticated decryption errors are isolated in the same way. One broken record must not prevent unrelated healthy sources from being read. Access expiry is enforced on read, including the exact expiry boundary.

Physical deletion still needs an operator-managed schedule. Invoke `node scripts/prune-source-leases.mjs` on the mounted production lease directory with `DRAWING_JOB_STORE_DIR` set, and monitor failures. This task does not install an external scheduler. Quarantined encrypted records need a separately approved retention/removal policy; they are not silently destroyed as healthy expired leases. Retain the source encryption secret across deployments; no keys are generated or rotated by this repair.

## Billing deployment and reconciliation

Checkout uses a persisted per-user purchase intent. Concurrent same-plan requests use the same Stripe customer and Checkout idempotency keys. A different pending plan, completed session awaiting reconciliation or existing subscription is a conflict, not a new purchase. A pending intent lasts one hour. A response lost after Stripe creation is retried with the same intent; never change the idempotency key merely because a network call failed. Stripe may reject a simultaneous in-progress request; retry the original intent rather than making another. Late creation attempts close to Stripe's expiry window may require waiting for/reconciling the pending intent, not silently bypassing it.

Subscriptions are persisted by subscription ID. Webhook duplicate IDs are ignored; ordering is checked against that subscription, and a terminal subscription is not revived by a late active event. User access is derived from all recorded subscriptions, so cancelling an older subscription does not remove access from a different active subscription. The existing Stripe signatures and price mapping remain mandatory. Real Stripe sandbox checkout completion, refunds and webhook delivery must still be validated in the deployment account.

## Remaining operational boundaries

Token and rate-limit storage remains process-local. Use a shared atomic store or trusted edge for production-wide quotas; do not describe these counters as a distributed global budget. Client input bytes, roles and finite numeric ranges are now checked before reservation. Reservations are uniquely settled once, can debit actual overage, and cannot cross the UTC day boundary. An aborted request with unknown actual usage conservatively retains its reservation.

Remote AI calls have cancellation and bounded timeouts. On-premise SDK and health requests refuse redirects. Allowlisting remains a deployment decision; network egress controls and DNS policy are separate layers. Quantity evidence keeps the sign, exponent and case-sensitive unit; it is not a proof that arbitrary natural-language reasoning or safety standards are correct.

No administrator ruleset is activated by committing `.github/main-ruleset.json`. Apply it with authorized Administration access after the named CI checks are confirmed. No merge, production migration, deployment, live billing test or external cleanup schedule is executed by this document.
