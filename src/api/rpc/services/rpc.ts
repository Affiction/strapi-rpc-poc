/**
 * rpc service — validates against the whitelist, then proxies to the upstream
 * JSON-RPC service.
 */

import type { Core } from "@strapi/strapi";
import { z } from "zod";

import {
  ALLOWED,
  rpcMethods,
  type RpcMethodName,
} from "../../../rpc/rpc-methods";
import {
  compose,
  withRetry,
  withTimeout,
  RpcTransportError,
  type UpstreamCall,
} from "../../../rpc/decorators";

export class RpcError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

let idCounter = 0;

const callUpstream: UpstreamCall = async (method, params, signal) => {
  const url = process.env.UPSTREAM_URL;
  const token = process.env.UPSTREAM_TOKEN;

  if (!url) throw new Error("UPSTREAM_URL is not configured");

  idCounter += 1;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: idCounter }),
      signal,
    });
  } catch (error) {
    throw new RpcTransportError(`Upstream request failed for ${method}`, error);
  }

  if (!response.ok) {
    throw new RpcTransportError(
      `Upstream responded with HTTP ${response.status} for ${method}`,
    );
  }

  const data = (await response.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };

  if (data.error) {
    throw new RpcError(data.error.code, data.error.message);
  }

  return data.result;
};

// Only idempotent methods may be retried on transport failure — retrying a
// non-idempotent write (e.g. createOrder) on a dropped connection could
// duplicate it upstream. Each retry attempt gets its own fresh timeout.
const withTransportSafety = compose(
  (fn: UpstreamCall) => withRetry(fn, { tries: 3, delay: 200 }),
  (fn: UpstreamCall) => withTimeout(fn, 5000),
);
const retryingCall = withTransportSafety(callUpstream);
const plainCall = withTimeout(callUpstream, 5000);

const handlers: Partial<Record<RpcMethodName, UpstreamCall>> =
  Object.fromEntries(
    Object.entries(rpcMethods).map(([name, def]) => [
      name,
      def.idempotent ? retryingCall : plainCall,
    ]),
  );

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async call(method: string, params: unknown) {
    if (!ALLOWED.has(method)) {
      throw new RpcError(-32601, `Method not found: ${method}`);
    }

    const methodName = method as RpcMethodName;
    const definition = rpcMethods[methodName];

    let validParams: unknown;
    try {
      validParams = definition.params.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new RpcError(-32602, `Invalid params: ${error.message}`);
      }
      throw error;
    }

    const dispatch = handlers[methodName] ?? plainCall;
    const result = await dispatch(methodName, validParams);

    const parsedResult = definition.result.safeParse(result);
    if (!parsedResult.success) {
      strapi.log.warn(
        `[rpc] upstream result for ${methodName} does not match schema: ${parsedResult.error.message}`,
      );
      return result;
    }

    return parsedResult.data;
  },
});
