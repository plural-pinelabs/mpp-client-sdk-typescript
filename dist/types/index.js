"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.P3PChallengeError = exports.P3PNetworkError = exports.P3PError = exports.PaymentMethod = exports.PaymentGateway = exports.PAYMENT_HEADER_PREFIX = exports.PAYMENT_CREDENTIAL_HEADER = void 0;
exports.PAYMENT_CREDENTIAL_HEADER = "P3P-Credential";
exports.PAYMENT_HEADER_PREFIX = "Payment ";
/** Payment gateway used by seller challenges and buyer credentials. */
var PaymentGateway;
(function (PaymentGateway) {
    PaymentGateway["PineLabsOnline"] = "PINE LABS ONLINE";
})(PaymentGateway || (exports.PaymentGateway = PaymentGateway = {}));
/** Payment methods supported by the current P3P service payload contract. */
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["UpiSbmd"] = "SBMD";
    PaymentMethod["Crypto"] = "CRYPTO";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
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
/** Error type raised when a seller challenge is missing, expired, or malformed. */
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
