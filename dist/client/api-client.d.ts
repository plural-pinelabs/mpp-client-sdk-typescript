import { CreateTokenOptions, FetchLike, PineLabsOnlineClientConfig, Token } from "../types";
import { AuthManager } from "./auth-manager";
export declare class ApiClient {
    private config;
    private baseUrl;
    private fetchImpl;
    private auth?;
    constructor(config: PineLabsOnlineClientConfig, baseUrl: string, fetchImpl: FetchLike, auth?: AuthManager | undefined);
    /** Create a one-time payment token for an active authorization. */
    createToken(options: CreateTokenOptions): Promise<Token>;
    private authHeaders;
    /** P3P request wrapper that unwraps `{ data: ... }` envelopes. */
    private request;
}
