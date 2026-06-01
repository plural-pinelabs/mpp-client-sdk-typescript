import { Challenge, Credential, BuyerRuntimeContext, CreateTokenOptions, FetchLike, PluralBuyerConfig, Token } from "../types";
import { ApiClient } from "./api-client";
import { FetchInterceptor } from "./fetch-interceptor";
export declare class BuyerMethods {
    private api;
    constructor(api: ApiClient);
    /** Create a one-time payment token through `POST /api/v1/customer/mpp/token`. */
    createToken(options: CreateTokenOptions): Promise<Token>;
}
export declare class PluralBuyerInstance {
    private interceptor;
    private httpFetch;
    methods: BuyerMethods;
    constructor(interceptor: FetchInterceptor, httpFetch: FetchLike, methods: BuyerMethods);
    /** Send an HTTP request and automatically handle P3P 402 challenges. */
    request(method: string, url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    get(url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    post(url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    put(url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    delete(url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    patch(url: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    /** Fetch-style alias for `request`, matching browser naming. */
    fetch(url: string, method?: string, init?: RequestInit, context?: BuyerRuntimeContext): Promise<Response>;
    /** Send an HTTP request without automatic 402 payment handling. */
    rawRequest(method: string, url: string, init?: RequestInit): Promise<Response>;
    /** Manually create a Payment credential for a decoded seller challenge. */
    createCredential(challenge: Challenge, context?: BuyerRuntimeContext): Promise<Credential>;
    close(): void;
}
export declare class PluralBuyer {
    /** Create a buyer SDK instance from `PluralBuyerConfig`. */
    static create(config: PluralBuyerConfig): PluralBuyerInstance;
}
