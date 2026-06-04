"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseToken = parseToken;
exports.asRecord = asRecord;
exports.stringOrUndefined = stringOrUndefined;
const types_1 = require("../types");
function parseToken(data) {
    const record = asRecord(data) ?? {};
    const customer = asRecord(record.customer);
    const hold = asRecord(record.hold) ?? {};
    const usage = asRecord(record.usage) ?? {};
    const limits = asRecord(record.usage_limits) ?? {};
    const paymentAmount = asRecord(record.payment_amount) ?? asRecord(record.paymentAmount);
    const paymentToken = String(record.payment_token ?? record.scoped_token ?? record.token ?? record.token_id ?? "");
    const paymentMethod = parsePaymentMethod(record.type);
    return {
        token_id: paymentToken,
        object: String(record.object ?? "p3p_payment_token"),
        customer_reference: String(customer?.merchant_customer_reference ?? record.merchant_customer_reference ?? record.customer_reference ?? record.customer_id ?? ""),
        customer_id: String(customer?.customer_id ?? record.customer_id ?? record.customer_reference ?? ""),
        mobile_number: stringOrUndefined(customer?.mobile_number ?? record.mobile_number),
        mandate_id: String(record.payment_method_reference_id ?? record.authorization_id ?? record.mandate_id ?? ""),
        token: paymentToken,
        payment_method: paymentMethod,
        payment_amount: paymentAmount ? {
            value: amountToInt(paymentAmount.value),
            currency: String(paymentAmount.currency ?? "INR"),
        } : undefined,
        challenge_id: stringOrUndefined(record.challenge_id),
        hold: {
            amount: Number(hold.amount ?? 0),
            status: String(hold.status ?? ""),
            expires_at: String(hold.expires_at ?? ""),
        },
        usage_limits: {
            max_amount: Number(limits.max_amount ?? 0),
            currency: String(limits.currency ?? "INR"),
            expires_at: String(limits.expires_at ?? ""),
            max_charges: limits.max_charges === undefined ? undefined : Number(limits.max_charges),
        },
        usage: {
            amount_used: Number(usage.amount_used ?? 0),
            charges_made: Number(usage.charges_made ?? 0),
        },
        expires_in: Number(record.expires_in ?? 0),
        metadata: asRecord(record.metadata) ?? { type: record.type ?? "RESERVE_PAY" },
        created_at: String(record.created_at ?? ""),
        raw: record,
    };
}
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function stringOrUndefined(value) {
    return value === undefined || value === null ? undefined : String(value);
}
function parsePaymentMethod(value) {
    return Object.values(types_1.PaymentMethod).includes(value)
        ? value
        : undefined;
}
function amountToInt(value) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}
