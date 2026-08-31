"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeChallenge = decodeChallenge;
exports.buildCredential = buildCredential;
exports.encodeCredentialHeader = encodeCredentialHeader;
exports.decodeReceipt = decodeReceipt;
exports.validateChallenge = validateChallenge;
exports.extractAmountPaise = extractAmountPaise;
exports.selectPaymentMethod = selectPaymentMethod;
const types_1 = require("../types");
const base64url_1 = require("../utils/base64url");
const parsers_1 = require("../utils/parsers");
/** Decode and validate a server `WWW-Authenticate: Payment ...` challenge. */
function decodeChallenge(wwwAuthenticateHeader) {
    const encoded = extractBase64Payload(wwwAuthenticateHeader);
    if (!encoded) {
        throw new types_1.P3PChallengeError("Invalid WWW-Authenticate header format", "");
    }
    const raw = (0, base64url_1.decodeJson)(encoded);
    const challenge = dictToChallenge(raw);
    validateChallenge(challenge);
    return challenge;
}
/** Build the client credential object that authorizes one server debit attempt. */
function buildCredential(challenge, agentId, token, paymentMethod, mobileNumber, paymentMethodReferenceId) {
    return {
        challenge,
        source: agentId,
        payload: {
            type: "token",
            token,
            payment_method_reference_id: paymentMethodReferenceId?.trim() || undefined,
            mobile_number: mobileNumber?.trim() || undefined,
            payment_method: paymentMethod,
        },
    };
}
/** Encode a credential as a `Payment <base64url>` header value for `P3P-Credential`. */
function encodeCredentialHeader(credential) {
    const payload = {
        type: credential.payload.type,
        token: credential.payload.token,
    };
    if (credential.payload.payment_method_reference_id) {
        payload.payment_method_reference_id = credential.payload.payment_method_reference_id;
    }
    if (credential.payload.mobile_number) {
        payload.mobile_number = credential.payload.mobile_number;
    }
    payload.payment_method = credential.payload.payment_method;
    return `${types_1.PAYMENT_HEADER_PREFIX}${(0, base64url_1.encodeJson)({
        challenge: challengePayload(credential.challenge),
        source: credential.source,
        payload,
    })}`;
}
/** Decode a server `Payment-Receipt` header into a typed receipt. */
function decodeReceipt(paymentReceiptHeader) {
    const encoded = extractBase64Payload(paymentReceiptHeader);
    if (!encoded) {
        throw new Error("Invalid Payment-Receipt header format");
    }
    const raw = (0, parsers_1.asRecord)((0, base64url_1.decodeJson)(encoded)) ?? {};
    const settlement = (0, parsers_1.asRecord)(raw.settlement) ?? {};
    const receipt = {
        status: raw.status === "success" ? "success" : "failure",
        timestamp: String(raw.timestamp ?? ""),
        reference: String(raw.reference ?? ""),
        challengeId: String(raw.challengeId ?? ""),
        settlement: {
            amount: String(settlement.amount ?? "0.00"),
            currency: String(settlement.currency ?? "INR"),
        },
    };
    const paymentGateway = raw.paymentGateway ?? raw.payment_gateway;
    const paymentMethod = raw.paymentMethod ?? raw.payment_method;
    if (paymentGateway !== undefined) {
        receipt.paymentGateway = parsePaymentGateway(paymentGateway);
    }
    if (paymentMethod !== undefined) {
        receipt.paymentMethod = parsePaymentMethod(paymentMethod);
    }
    return receipt;
}
/** Validate that a decoded challenge is usable and not expired. */
function validateChallenge(challenge) {
    if (!challenge.id) {
        throw new types_1.P3PChallengeError("Challenge missing id", "");
    }
    if (!challenge.request?.amount || !challenge.request.currency) {
        throw new types_1.P3PChallengeError("Challenge missing payment request details", challenge.id);
    }
    if (!challenge.request.availablePaymentMethods.length) {
        throw new types_1.P3PChallengeError("Challenge missing available payment methods", challenge.id);
    }
    const expiresMs = Date.parse(challenge.expires);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
        throw new types_1.P3PChallengeError("Challenge has expired", challenge.id);
    }
}
/** Return the challenge amount in paise for token creation. */
function extractAmountPaise(challenge) {
    const majorUnits = Number(challenge.request.amount);
    if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
        throw new types_1.P3PChallengeError(`Invalid challenge amount: ${challenge.request.amount}`, challenge.id);
    }
    return Math.round(majorUnits * 100);
}
function extractBase64Payload(header) {
    const trimmed = header.trim();
    const payload = trimmed.startsWith(types_1.PAYMENT_HEADER_PREFIX)
        ? trimmed.slice(types_1.PAYMENT_HEADER_PREFIX.length).trim()
        : trimmed;
    return (0, base64url_1.isBase64Url)(payload) ? payload : undefined;
}
function dictToChallenge(raw) {
    const record = (0, parsers_1.asRecord)(raw) ?? {};
    const req = (0, parsers_1.asRecord)(record.request) ?? {};
    return {
        id: String(record.id ?? ""),
        realm: String(record.realm ?? ""),
        intent: String(record.intent ?? ""),
        request: {
            scheme: String(req.scheme ?? ""),
            amount: String(req.amount ?? ""),
            currency: String(req.currency ?? ""),
            resource: String(req.resource ?? ""),
            availablePaymentMethods: parsePaymentMethods(req.availablePaymentMethods ?? req.available_payment_methods),
        },
        expires: String(record.expires ?? ""),
    };
}
function selectPaymentMethod(challenge, selectedPaymentMethod) {
    if (!challenge.request.availablePaymentMethods.includes(selectedPaymentMethod)) {
        throw new types_1.P3PChallengeError(`Selected payment method ${selectedPaymentMethod} is not accepted by this server challenge`, challenge.id);
    }
    return selectedPaymentMethod;
}
function parsePaymentGateway(value) {
    return value === undefined || value === null ? undefined : String(value);
}
function parsePaymentMethod(value) {
    if (value === types_1.PaymentMethod.RESERVE_PAY || value === types_1.PaymentMethod.CARD || value === types_1.PaymentMethod.CREDIT_EMI || value === types_1.PaymentMethod.Crypto) {
        return value;
    }
    if (value === types_1.PaymentMethod.OTM) {
        return types_1.PaymentMethod.OTM;
    }
    return String(value ?? "");
}
function parsePaymentMethods(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(parsePaymentMethod);
}
function challengePayload(challenge) {
    return {
        id: challenge.id,
        realm: challenge.realm,
        intent: challenge.intent,
        request: challenge.request,
        expires: challenge.expires,
    };
}
