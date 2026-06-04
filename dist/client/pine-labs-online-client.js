"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineLabsOnlineClient = exports.PineLabsOnlineClientInstance = exports.ClientMethods = void 0;
const config_1 = require("../config");
const types_1 = require("../types");
const validation_1 = require("../utils/validation");
const api_client_1 = require("./api-client");
const auth_manager_1 = require("./auth-manager");
const fetch_interceptor_1 = require("./fetch-interceptor");
class ClientMethods {
    api;
    constructor(api) {
        this.api = api;
    }
    /** Create a one-time payment token through `POST /api/v1/customer/mpp/token`. */
    createToken(options) {
        return this.api.createToken(options);
    }
}
exports.ClientMethods = ClientMethods;
class PineLabsOnlineClientInstance {
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
    /** Manually create a Payment credential for a decoded server challenge. */
    createCredential(challenge, context) {
        return this.interceptor.createCredentialForChallenge(challenge, context);
    }
    close() {
        // fetch-backed implementation has no persistent client to close.
    }
}
exports.PineLabsOnlineClientInstance = PineLabsOnlineClientInstance;
class PineLabsOnlineClient {
    /** Create a client SDK instance from `PineLabsOnlineClientConfig`. */
    static create(config) {
        (0, validation_1.validateConfig)(config);
        const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!fetchImpl) {
            throw new Error("A fetch implementation is required.");
        }
        const envBaseUrl = (0, config_1.resolveP3PBaseUrl)(config.env);
        const auth = (0, validation_1.resolveCustomerAuthMode)(config) === types_1.P3PCustomerAuthMode.ClientCredentials
            ? new auth_manager_1.AuthManager(config, envBaseUrl, fetchImpl)
            : undefined;
        const api = new api_client_1.ApiClient(config, envBaseUrl, fetchImpl, auth);
        const interceptor = new fetch_interceptor_1.FetchInterceptor(config, api, fetchImpl);
        return new PineLabsOnlineClientInstance(interceptor, fetchImpl, new ClientMethods(api));
    }
}
exports.PineLabsOnlineClient = PineLabsOnlineClient;
