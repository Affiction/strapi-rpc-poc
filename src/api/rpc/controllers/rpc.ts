/**
 * rpc controller — thin JSON-RPC 2.0 envelope, no business logic.
 */

import type { Core } from "@strapi/strapi";
import { RpcError } from "../services/rpc";

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async call(ctx: any) {
    const { method, params, id = null } = ctx.request.body ?? {};

    if (typeof method !== "string") {
      ctx.status = 400;
      ctx.body = {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid request: method is required" },
        id,
      };
      return;
    }

    try {
      const result = await strapi.service("api::rpc.rpc").call(method, params);

      ctx.body = { jsonrpc: "2.0", result, id };
    } catch (error) {
      const rpcError =
        error instanceof RpcError
          ? error
          : new RpcError(-32603, (error as Error).message);
      ctx.status =
        rpcError.code === -32601 ? 404 : rpcError.code === -32602 ? 400 : 500;
      ctx.body = {
        jsonrpc: "2.0",
        error: { code: rpcError.code, message: rpcError.message },
        id,
      };
    }
  },
});
