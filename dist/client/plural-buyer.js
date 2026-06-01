"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluralBuyer = exports.PluralBuyerInstance = exports.BuyerMethods = void 0;
const config_1 = require("../config");
const validation_1 = require("../utils/validation");
const api_client_1 = require("./api-client");
const fetch_interceptor_1 = require("./fetch-interceptor");
class BuyerMethods {
    api;
    constructor(api) {
        this.api = api;
    }
    /** Create a one-time payment token through `POST /api/v1/customer/mpp/token`. */
    createToken(options) {
        return this.api.createToken(options);
    }
}
exports.BuyerMethods = BuyerMethods;
class PluralBuyerInstance {
    interceptor;
    httpFetch;
    methods;
    constructor(interceptor, httpFetch, methods) {
        this.interceptor = interceptor;
        this.httpFetch = httpFetch;
        this.methods = methods;
    }
    /** Send an HTTP request and automatically handle P3P 402 challenges. */
    request(method, url, init = {}, context) {
        return this.interceptor.request(method, url, init, context);
    }
    get(url, init = {}, context) {
        return this.request("GET", url, init, context);
    }
    post(url, init = {}, context) {
        return this.request("POST", url, init, context);
    }
    put(url, init = {}, context) {
        return this.request("PUT", url, init, context);
    }
    delete(url, init = {}, context) {
        return this.request("DELETE", url, init, context);
    }
    patch(url, init = {}, context) {
        return this.request("PATCH", url, init, context);
    }
    /** Fetch-style alias for `request`, matching browser naming. */
    fetch(url, method = "GET", init = {}, context) {
        return this.request(method, url, init, context);
    }
    /** Send an HTTP request without automatic 402 payment handling. */
    rawRequest(method, url, init = {}) {
        return this.httpFetch(url, { ...init, method });
    }
    /** Manually create a Payment credential for a decoded seller challenge. */
    createCredential(challenge, context) {
        return this.interceptor.createCredentialForChallenge(challenge, context);
    }
    close() {
        // fetch-backed implementation has no persistent client to close.
    }
}
exports.PluralBuyerInstance = PluralBuyerInstance;
class PluralBuyer {
    /** Create a buyer SDK instance from `PluralBuyerConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!fetchImpl) {
            throw new Error("A fetch implementation is required.");
        }
        const envBaseUrl = (0, config_1.resolveP3PBaseUrl)(config.env);
        const api = new api_client_1.ApiClient(config, envBaseUrl, fetchImpl);
        const interceptor = new fetch_interceptor_1.FetchInterceptor(config, api, fetchImpl);
        return new PluralBuyerInstance(interceptor, fetchImpl, new BuyerMethods(api));
    }
}
exports.PluralBuyer = PluralBuyer;
