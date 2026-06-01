import { FetchLike, PluralBuyerConfig } from "../types";
export declare function requestWithRetry(fetchImpl: FetchLike, url: string, init: RequestInit, config: Pick<PluralBuyerConfig, "requestTimeoutMs" | "maxRetries" | "initialRetryDelayMs">): Promise<Response>;
export declare function safeJson(response: Response): Promise<unknown>;
export declare function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string>;
