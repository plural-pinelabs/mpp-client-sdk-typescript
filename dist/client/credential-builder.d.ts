import { Challenge, Credential, PaymentMethod, Receipt } from "../types";
/** Decode and validate a server `WWW-Authenticate: Payment ...` challenge. */
export declare function decodeChallenge(wwwAuthenticateHeader: string): Challenge;
/** Build the client credential object that authorizes one server debit attempt. */
export declare function buildCredential(challenge: Challenge, agentId: string, token: string, paymentMethod: PaymentMethod, customerReference?: string, mobileNumber?: string): Credential;
/** Encode a credential as a `Payment <base64url>` header value for `P3P-Credential`. */
export declare function encodeCredentialHeader(credential: Credential): string;
/** Decode a server `Payment-Receipt` header into a typed receipt. */
export declare function decodeReceipt(paymentReceiptHeader: string): Receipt;
/** Validate that a decoded challenge is usable and not expired. */
export declare function validateChallenge(challenge: Challenge): void;
/** Return the challenge amount in paise for token creation. */
export declare function extractAmountPaise(challenge: Challenge): number;
export declare function selectPaymentMethod(challenge: Challenge, selectedPaymentMethod: PaymentMethod): PaymentMethod;
