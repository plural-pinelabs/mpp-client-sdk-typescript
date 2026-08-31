"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.P3PChallengeError = exports.P3PNetworkError = exports.P3PError = exports.P3PCustomerAuthMode = exports.PaymentMethod = exports.PaymentGateway = exports.GRANTEX_TOKEN_HEADER = exports.PAYMENT_HEADER_PREFIX = exports.PAYMENT_CREDENTIAL_HEADER = void 0;
exports.PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
exports.PAYMENT_HEADER_PREFIX = "Payment ";
exports.GRANTEX_TOKEN_HEADER = "X-Grantex-Token";
/** Payment gateway enum retained for receipt/config context. */
var PaymentGateway;
(function (PaymentGateway) {
    PaymentGateway["PineLabsOnline"] = "PINE LABS ONLINE";
})(PaymentGateway || (exports.PaymentGateway = PaymentGateway = {}));
/** Payment methods supported by the current P3P service payload contract. */
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["RESERVE_PAY"] = "RESERVE_PAY";
    PaymentMethod["OTM"] = "OTM";
    PaymentMethod["CARD"] = "CARD";
    PaymentMethod["CREDIT_EMI"] = "CREDIT_EMI";
    PaymentMethod["Crypto"] = "CRYPTO";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
/** Customer authorization mode used when the client SDK creates P3P payment tokens. */
var P3PCustomerAuthMode;
(function (P3PCustomerAuthMode) {
    P3PCustomerAuthMode["CustomerKey"] = "CUSTOMER_KEY";
    P3PCustomerAuthMode["ClientCredentials"] = "CLIENT_CREDENTIALS";
})(P3PCustomerAuthMode || (exports.P3PCustomerAuthMode = P3PCustomerAuthMode = {}));
/** Error type raised for non-2xx P3P service responses. */
class P3PError extends Error {
    code;
    httpStatus;
    details;
    constructor(code, message, httpStatus, details) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = "P3PError";
    }
    static fromResponse(status, body) {
        const record = asRecord(body) ?? {};
        if (typeof record.error === "string") {
            return new P3PError(String(record.code ?? "MPP_ERROR"), record.error, status, asRecord(record.additional_error_details));
        }
        const error = asRecord(record.error) ?? record;
        return new P3PError(String(error.code ?? "MPP_INTERNAL_ERROR"), String(error.message ?? `HTTP ${status}`), status, asRecord(error.additional_error_details));
    }
    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                additional_error_details: this.details,
            },
        };
    }
}
exports.P3PError = P3PError;
class P3PNetworkError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "P3PNetworkError";
    }
}
exports.P3PNetworkError = P3PNetworkError;
/** Error type raised when a server challenge is missing, expired, or malformed. */
class P3PChallengeError extends Error {
    challengeId;
    constructor(message, challengeId) {
        super(message);
        this.challengeId = challengeId;
        this.name = "P3PChallengeError";
    }
}
exports.P3PChallengeError = P3PChallengeError;
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
