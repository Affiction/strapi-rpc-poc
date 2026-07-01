/**
 * Business errors (upstream returned a well-formed `{ error }` response) must
 * NOT be retried — only transport-level failures (network drop, timeout) are.
 * callUpstream throws this for anything below the JSON-RPC layer so withRetry
 * can tell the two apart.
 */
export class RpcTransportError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RpcTransportError";
    this.cause = cause;
  }
}

export interface RetryOptions {
  tries: number;
  delay: number;
}

export type UpstreamCall = (
  method: string,
  params: unknown,
  signal?: AbortSignal,
) => Promise<unknown>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof RpcTransportError) return true;

  const name = (error as { name?: string } | undefined)?.name;

  return name === "FetchError" || name === "AbortError" || name === "TypeError";
};

export function withRetry(
  fn: UpstreamCall,
  { tries, delay }: RetryOptions,
): UpstreamCall {
  return async (method, params, signal) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= tries; attempt += 1) {
      try {
        return await fn(method, params, signal);
      } catch (error) {
        lastError = error;

        if (!isRetryableError(error) || attempt === tries) throw error;

        await sleep(delay);
      }
    }

    throw lastError;
  };
}

export function withTimeout(fn: UpstreamCall, ms: number): UpstreamCall {
  return async (method, params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      return await fn(method, params, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function compose(
  ...wraps: Array<(fn: UpstreamCall) => UpstreamCall>
): (fn: UpstreamCall) => UpstreamCall {
  return (fn) => wraps.reduceRight((acc, wrap) => wrap(acc), fn);
}
