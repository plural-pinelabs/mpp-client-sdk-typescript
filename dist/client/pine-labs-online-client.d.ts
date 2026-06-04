import { Challenge, Credential, ClientRuntimeContext, CreateTokenOptions, FetchLike, PineLabsOnlineClientConfig, Token } from "../types";
import { ApiClient } from "./api-client";
import { FetchInterceptor } from "./fetch-interceptor";
export declare class ClientMethods {
    private api;
    constructor(api: ApiClient);
    /** Create a one-time payment token through `POST /api/v1/customer/mpp/token`. */
    createToken(options: CreateTokenOptions): Promise<Token>;
}
export declare class PineLabsOnlineClientInstance {
    private interceptor;
    private httpFetch;
    methods: ClientMethods;
    constructor(interceptor: FetchInterceptor, httpFetch: FetchLike, methods: ClientMethods);
    /** Send an HTTP request and automatically handle P3P 402 challenges. */
    request(method: string, url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    get(url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    post(url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    put(url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    delete(url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    patch(url: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    /** Fetch-style alias for `request`, matching browser naming. */
    fetch(url: string, method?: string, init?: RequestInit, context?: ClientRuntimeContext): Promise<Response>;
    /** Send an HTTP request without automatic 402 payment handling. */
    rawRequest(method: string, url: string, init?: RequestInit): Promise<Response>;
    /** Manually create a Payment credential for a decoded server challenge. */
    createCredential(challenge: Challenge, context?: ClientRuntimeContext): Promise<Credential>;
    close(): void;
}
export declare class PineLabsOnlineClient {
    /** Create a client SDK instance from `PineLabsOnlineClientConfig`. */
    static create(config: PineLabsOnlineClientConfig): PineLabsOnlineClientInstance;
}
