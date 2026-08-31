import { ClientGrantexConfig, GrantexVerificationResult } from "../types";
export type { ClientGrantexConfig, GrantexVerificationResult, GrantexVerifiedGrant, GrantexVerifierLike, } from "../types";
/** Verify Grantex grant tokens using the published `@grantex/sdk` package. */
export declare class GrantTokenVerifier {
    private readonly config;
    constructor(config: ClientGrantexConfig);
    verify(token: string): Promise<GrantexVerificationResult>;
}
export declare function hasGrantScope(scopes: readonly string[], requiredScope: string): boolean;
export declare function missingGrantScopes(scopes: readonly string[], requiredScopes?: readonly string[]): string[];
