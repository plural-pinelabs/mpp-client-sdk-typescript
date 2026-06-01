import { CreateTokenOptions, FetchLike, PluralBuyerConfig, Token } from "../types";
export declare class ApiClient {
    private config;
    private baseUrl;
    private fetchImpl;
    constructor(config: PluralBuyerConfig, baseUrl: string, fetchImpl: FetchLike);
    /** Create a one-time payment token for an active authorization. */
    createToken(options: CreateTokenOptions): Promise<Token>;
    /** P3P request wrapper that unwraps `{ data: ... }` envelopes. */
    private request;
}
