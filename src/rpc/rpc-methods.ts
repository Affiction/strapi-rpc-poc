import { z } from 'zod';

export const rpcMethods = {
  'PricingService.recalculate': {
    params: z.object({ cartId: z.string() }),
    result: z.object({ total: z.number() }),
    idempotent: true,
  },
  'UserManager.banUser': {
    params: z.object({ id: z.number(), reason: z.string() }),
    result: z.object({ banned: z.boolean() }),
    idempotent: true,
  },
  'OrderService.createOrder': {
    params: z.object({ items: z.array(z.string()) }),
    result: z.object({ orderId: z.string() }),
    idempotent: false, // NO retry unless idempotency key supported
  },
} as const;

export type RpcMethodName = keyof typeof rpcMethods;

// Whitelist auto-derived from rpcMethods keys — never accept an arbitrary method.
export const ALLOWED: ReadonlySet<string> = new Set(Object.keys(rpcMethods));

export type RpcParams<M extends RpcMethodName> = z.infer<(typeof rpcMethods)[M]['params']>;
export type RpcResult<M extends RpcMethodName> = z.infer<(typeof rpcMethods)[M]['result']>;
