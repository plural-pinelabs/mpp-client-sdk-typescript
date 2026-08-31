"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BASE_URL = exports.P3PEnvironmentDefaults = exports.P3PEnvironment = void 0;
exports.isP3PEnvironment = isP3PEnvironment;
exports.resolveP3PBaseUrl = resolveP3PBaseUrl;
exports.withP3PEnvironmentDefaults = withP3PEnvironmentDefaults;
exports.P3PEnvironment = {
    SANDBOX: "https://pluraluat.v2.pinepg.in",
    PRODUCTION: "https://api.pluralpay.in",
};
exports.P3PEnvironmentDefaults = {
    [exports.P3PEnvironment.SANDBOX]: {
        requestTimeoutMs: 60_000,
        maxRetries: 3,
        initialRetryDelayMs: 500,
    },
    [exports.P3PEnvironment.PRODUCTION]: {
        requestTimeoutMs: 45_000,
        maxRetries: 3,
        initialRetryDelayMs: 500,
    },
};
function isP3PEnvironment(value) {
    return value === exports.P3PEnvironment.SANDBOX || value === exports.P3PEnvironment.PRODUCTION;
}
function resolveP3PBaseUrl(env = exports.P3PEnvironment.PRODUCTION) {
    if (!isP3PEnvironment(env)) {
        throw new Error("env must be P3PEnvironment.SANDBOX or P3PEnvironment.PRODUCTION");
    }
    return env;
}
function withP3PEnvironmentDefaults(config) {
    const env = config.env ?? exports.P3PEnvironment.PRODUCTION;
    const defaults = exports.P3PEnvironmentDefaults[env];
    return {
        ...config,
        env,
        requestTimeoutMs: config.requestTimeoutMs ?? defaults.requestTimeoutMs,
        maxRetries: config.maxRetries ?? defaults.maxRetries,
        initialRetryDelayMs: config.initialRetryDelayMs ?? defaults.initialRetryDelayMs,
    };
}
exports.DEFAULT_BASE_URL = exports.P3PEnvironment.PRODUCTION;
