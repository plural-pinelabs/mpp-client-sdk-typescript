import { ClientRuntimeContext, Challenge, Credential, FetchLike, PineLabsOnlineClientConfig } from "../types";
import { ApiClient } from "./api-client";
export declare class FetchInterceptor {
    private config;
    private api;
    private fetchImpl;
    constructor(config: PineLabsOnlineClientConfig, api: ApiClient, fetchImpl: FetchLike);
    /** Send an HTTP request and automatically handle server P3P 402 challenges. */
    request(method: string, url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    /** Create a one-time P3P token and wrap it in a Payment credential. */
    createCredentialForChallenge(challenge: Challenge, context?: ClientRuntimeContext): Promise<Credential>;
    private handle402;
}
