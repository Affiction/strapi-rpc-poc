# strapi-rpc

A [Strapi 5](https://strapi.io) backend with a typed RPC proxy bolted on: whitelisted `Class.method` calls are forwarded to an upstream JSON-RPC 2.0 service, validated end-to-end with [Zod](https://zod.dev), and documented automatically via OpenAPI/Swagger — all from one schema definition.

## Contents

- [Features](#features)
- [Plugins](#plugins)
- [Getting started](#getting-started)
- [RPC proxy](#rpc-proxy)
- [Testing](#testing)
- [CLI](#cli)

## Features

- **Single source of truth** — `src/rpc/rpc-methods.ts` defines every RPC method's params/result shape and idempotency once. That one file drives runtime validation, the upstream whitelist, and the OpenAPI docs simultaneously — there is no second place to keep in sync.
- **Whitelist-enforced proxying** — the client can never make the server call an arbitrary upstream method. Only methods declared in `rpcMethods` are dispatchable; everything else is rejected with a JSON-RPC `-32601` error before any network call happens.
- **Params validated before dispatch** — Zod parses `params` against the method's schema first. Malformed input never reaches the upstream service.
- **Safe retries** — network/timeout failures are retried (idempotent methods only); a well-formed upstream `{ error }` response is treated as a business error and is never retried, since retrying a non-idempotent write on a transient failure could duplicate it.
- **Docs generated from the same schemas that validate requests** — no hand-maintained OpenAPI spec to drift from the code.

## Plugins

This project uses the following Strapi plugins, in addition to Strapi core:

| Plugin | Purpose |
| --- | --- |
| [`@strapi/plugin-documentation`](https://docs.strapi.io/dev-docs/plugins/documentation) | Generates the OpenAPI spec and serves Swagger UI at `/documentation`. `src/index.ts` registers an override (`src/rpc/openapi.ts`) that injects every RPC method into the generated spec alongside the standard CRUD endpoints. |
| [`strapi-plugin-config-sync`](https://github.com/boazpoolman/strapi-plugin-config-sync) | Syncs Strapi config (roles, permissions, content-type settings) as JSON files under `config/sync/`, so config changes made in one environment's admin panel can be committed and replayed in another. |

## Getting started

**Prerequisites**: Node `>=20 <=26`, npm `>=6` (see `engines` in `package.json`).

```bash
npm install
cp .env.example .env   # fill in APP_KEYS/secrets and UPSTREAM_URL/UPSTREAM_TOKEN
npm run develop
```

The admin panel is at `http://localhost:1337/admin` (first run prompts you to create an admin user). Swagger docs are at `http://localhost:1337/documentation`.

## RPC proxy

### How it's wired

```
POST /api/rpc
  → src/api/rpc/routes/rpc.ts        (route, requires auth)
  → src/api/rpc/controllers/rpc.ts   (thin JSON-RPC 2.0 envelope)
  → src/api/rpc/services/rpc.ts      (whitelist check → Zod validate → dispatch → validate result)
  → src/rpc/decorators.ts            (withRetry / withTimeout, only for idempotent methods)
  → upstream service (UPSTREAM_URL)
```

### Adding a new method

Edit `src/rpc/rpc-methods.ts` only:

```ts
export const rpcMethods = {
  'PricingService.recalculate': {
    params: z.object({ cartId: z.string() }),
    result: z.object({ total: z.number() }),
    idempotent: true, // safe to retry on a dropped connection
  },
  'OrderService.createOrder': {
    params: z.object({ items: z.array(z.string()) }),
    result: z.object({ orderId: z.string() }),
    idempotent: false, // a write — never retried automatically
  },
} as const;
```

That's the entire change. The method is now whitelisted, its params/result are validated at runtime, and it appears in Swagger under the `RPC` tag — no other file needs touching.

### Calling it

```json
POST /api/rpc
{ "method": "PricingService.recalculate", "params": { "cartId": "abc123" }, "id": 1 }
```

```json
{ "jsonrpc": "2.0", "result": { "total": 42 }, "id": 1 }
```

Auth: this route is **not public**. Either send an `Authorization: Bearer <token>` header with a Strapi API token (Settings → API Tokens), or grant the `Rpc.call` permission to a role (Settings → Users & Permissions → Roles).

### Configuration

Set in `.env` — the upstream token is server-side only and is never sent to the client:

```
UPSTREAM_URL=https://your-upstream.example.com/rpc
UPSTREAM_TOKEN=your-upstream-token
```

## Testing

There's no automated test suite in this project yet — verification is currently manual, against a local stand-in for the upstream service. `scripts/mock-upstream.js` is a small HTTP server with one canned response per whitelisted method (edit its `RESPONSES` map to try different payloads), matching the default `UPSTREAM_URL=http://127.0.0.1:4310/rpc`:

```bash
npm run mock:upstream
```

With that running (and `npm run develop` in another terminal), each of the following exercises a distinct code path — via curl, Postman, or Swagger's "Try it out":

| Scenario | Request | What it proves |
| --- | --- | --- |
| Valid call | `{"method":"PricingService.recalculate","params":{"cartId":"abc"},"id":1}` | Whitelisted method + valid params reach the upstream and the response is returned validated. |
| Unknown method | `{"method":"Evil.hack","params":{},"id":2}` | Rejected with `-32601` before any upstream call — check `scripts/mock-upstream.js`'s log to confirm it was never hit. |
| Invalid params | `{"method":"PricingService.recalculate","params":{"cartId":123},"id":3}` | Rejected with `-32602` (Zod error) before any upstream call — same log check. |
| Business error | `{"method":"OrderService.createOrder","params":{"items":["sku1"]},"id":4}` | Upstream returns a well-formed `{ error }`; the proxy forwards it as-is and does **not** retry, since it's not a non-idempotent method and not a transport failure. |
| Transport failure | Stop `npm run mock:upstream`, then call any idempotent method | The service retries 3 times (200ms apart) before surfacing a `-32603` transport error — confirms `withRetry` only fires on network-level failures, not business errors. |

## CLI

### `develop`

Start the app with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```bash
npm run develop
```

### `start`

Start the app with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```bash
npm run start
```

### `build`

Build the admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```bash
npm run build
```
