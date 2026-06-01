"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BASE_URL = exports.P3PEnvironment = void 0;
exports.isP3PEnvironment = isP3PEnvironment;
exports.resolveP3PBaseUrl = resolveP3PBaseUrl;
exports.P3PEnvironment = {
    SANDBOX: "https://pluraluat.v2.pinepg.in",
    PRODUCTION: "https://api.pluralpay.in",
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
exports.DEFAULT_BASE_URL = exports.P3PEnvironment.PRODUCTION;
