import { FetchLike, P3PNetworkError, PineLabsOnlineClientConfig } from "../types";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_RETRY_DELAY_MS = 500;

export async function requestWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  config: Pick<PineLabsOnlineClientConfig, "requestTimeoutMs" | "maxRetries" | "initialRetryDelayMs">,
): Promise<Response> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchImpl(url, withTimeout(init, config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS));
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS, response));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs(attempt, config.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS));
        continue;
      }
      throw new P3PNetworkError(`Network error calling ${url}`, error);
    }
  }
  throw new P3PNetworkError(`P3P request failed: ${url}`, lastError);
}

export async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function withTimeout(init: RequestInit, timeoutMs: number): RequestInit {
  if (init.signal || typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return init;
  }
  return { ...init, signal: AbortSignal.timeout(timeoutMs) };
}

function retryDelayMs(attempt: number, initialMs: number, response?: Response): number {
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return initialMs * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
