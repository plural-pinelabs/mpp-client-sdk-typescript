import { BuyerRuntimeContext, Challenge, Credential, FetchLike, PluralBuyerConfig } from "../types";
import { ApiClient } from "./api-client";
export declare class FetchInterceptor {
    private config;
    private api;
    private fetchImpl;
    constructor(config: PluralBuyerConfig, api: ApiClient, fetchImpl: FetchLike);
    /** Send an HTTP request and automatically handle seller P3P 402 challenges. */
    request(method: string, url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    /** Create a one-time P3P token and wrap it in a Payment credential. */
    createCredentialForChallenge(challenge: Challenge, context?: BuyerRuntimeContext): Promise<Credential>;
    private handle402;
}
