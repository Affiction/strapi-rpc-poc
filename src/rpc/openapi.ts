import { z } from 'zod';
import { createDocument, type ZodOpenApiPathsObject } from 'zod-openapi';
import { rpcMethods } from './rpc-methods';

/**
 * One `POST /rpc#<Class.method>` entry per method — the `#` fragment keeps
 * each path unique in Swagger UI while every one of them hits the same
 * `POST /rpc` endpoint at runtime. Request/response schemas mirror the
 * actual JSON-RPC 2.0 envelope (not just the bare params/result), so
 * Swagger's "Try it out" prefills a body that the endpoint really accepts.
 */
export function buildRpcPaths(methods: typeof rpcMethods): ZodOpenApiPathsObject {
  const paths: ZodOpenApiPathsObject = {};

  for (const [name, definition] of Object.entries(methods)) {
    const requestSchema = z.object({
      method: z.literal(name),
      params: definition.params,
      id: z.union([z.string(), z.number()]).default(1),
    });

    const responseSchema = z.object({
      jsonrpc: z.literal('2.0'),
      result: definition.result,
      id: z.union([z.string(), z.number()]).nullable(),
    });

    paths[`/rpc#${name}`] = {
      post: {
        tags: ['RPC'],
        summary: name,
        description: `Idempotent: ${definition.idempotent}`,
        requestBody: {
          content: {
            'application/json': {
              schema: requestSchema,
            },
          },
        },
        responses: {
          '200': {
            description: `${name} result`,
            content: {
              'application/json': {
                schema: responseSchema,
              },
            },
          },
        },
      },
    };
  }

  return paths;
}

export function buildRpcDocument() {
  const document = createDocument({
    openapi: '3.0.3',
    info: { title: 'RPC', version: '1.0.0' },
    paths: buildRpcPaths(rpcMethods),
  });

  return { paths: document.paths, components: document.components };
}
