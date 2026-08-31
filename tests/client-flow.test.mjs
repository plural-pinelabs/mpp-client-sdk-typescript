import assert from "node:assert/strict";
import test from "node:test";

import {
  P3PEnvironment,
  P3PCustomerAuthMode,
  P3PError,
  GRANTEX_TOKEN_HEADER,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineClient,
  buildCredential,
  decodeChallenge,
  decodeReceipt,
  encodeCredentialHeader,
} from "../dist/index.js";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function response(status, body, headers = {}) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

test("decodes challenges and encodes mobile-only credentials with mandate reference", () => {
  const challengePayload = {
    id: "ch_test",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "100.00",
      currency: "INR",
      resource: "/premium",
      availablePaymentMethods: ["RESERVE_PAY", "OTM", "CRYPTO"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const challenge = decodeChallenge(`Payment ${encodeJson(challengePayload)}`);
  assert.deepEqual(challenge.request.availablePaymentMethods, [
    PaymentMethod.RESERVE_PAY,
    PaymentMethod.OTM,
    PaymentMethod.Crypto,
  ]);
  const credential = buildCredential(challenge, "9876543210", "P3P_TOK_test", PaymentMethod.OTM, "9876543210", "auth_123");
  const header = encodeCredentialHeader(credential);

  assert.equal(header.startsWith("Payment "), true);
  const encoded = header.slice("Payment ".length);
  const raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal("paymentGateway" in raw.challenge, false);
  assert.equal(raw.payload.customer_reference, undefined);
  assert.equal(raw.payload.payment_method_reference_id, "auth_123");
  assert.equal(raw.payload.mobile_number, "9876543210");
  assert.equal(raw.payload.payment_method, PaymentMethod.OTM);
});

test("auto handles 402 challenge with the selected accepted payment method", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_123",
    realm: "Pine Labs Online P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["RESERVE_PAY", "OTM"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const parsed = new URL(url);
    calls.push({ url, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "customer-key-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal(init.headers.Authorization, "Bearer customer-key-access-token");
      const body = JSON.parse(init.body);
      assert.deepEqual(body, {
        payment_method: "OTM",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_123",
        payment_amount: { value: 15000, currency: "INR" },
      });
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          payment_method: "OTM",
          payment_method_reference_id: "mnd_test",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/premium") {
      const p3pCredential = init.headers?.["P3P-Credential"] ?? init.headers?.["p3p-credential"] ?? "";
      assert.equal(String(init.headers?.Authorization ?? ""), "");
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_123" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.payload.payment_method, PaymentMethod.OTM);
      assert.equal(credential.payload.payment_method_reference_id, "mnd_test");
      assert.equal(credential.payload.mobile_number, "9876543210");
      return response(
        200,
        { ok: true },
        {
          "Payment-Receipt": `Payment ${encodeJson({
            status: "success",
            paymentGateway: PaymentGateway.PineLabsOnline,
            paymentMethod: PaymentMethod.OTM,
            timestamp: "2030-01-01T00:00:00Z",
            reference: "cap_123",
            challengeId: "ch_123",
            settlement: { amount: "150.00", currency: "INR" },
          })}`,
        },
      );
    }

    return response(404, { error: "not found" });
  };

  let receiptSeen;
  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
    onPaymentComplete: (receipt) => {
      receiptSeen = receipt;
    },
  });

  const finalResponse = await client.get(
    "https://api.test/api/premium",
    {},
    {
      customerKey: "ck_test_customer",
      customerReference: "cust-ref-123",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.OTM,
    },
  );
  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), { ok: true });
  assert.equal(receiptSeen.settlement.amount, "150.00");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/premium", "/api/auth/v1/token", "/api/v1/customer/mpp/token", "/api/premium"],
  );
});

test("client methods create CARD tokens with customer auth", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "client-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_card_test");
      assert.equal(init.headers.Authorization, "Bearer client-access-token");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "CARD",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_card_123",
        payment_amount: { value: 2500, currency: "INR" },
      });
      return response(200, {
        data: {
          payment_token: "tok_card_123",
          payment_method: "CARD",
          payment_method_reference_id: "auth_card_123",
          expires_in: 300,
        },
      });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const token = await client.methods.createToken({
    customerKey: "ck_card_test",
    mobileNumber: "9876543210",
    challengeId: "ch_card_123",
    paymentAmount: { value: 2500, currency: "INR" },
    paymentMethod: PaymentMethod.CARD,
  });

  assert.equal(token.token, "tok_card_123");
  assert.equal(token.payment_method, PaymentMethod.CARD);
  assert.equal(token.mandate_id, "auth_card_123");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/auth/v1/token", "/api/v1/customer/mpp/token"],
  );
});

test("auto handles 402 using runtime customer context with a shared client", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_runtime",
    realm: "Pine Labs Online P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/runtime",
      availablePaymentMethods: ["RESERVE_PAY", "OTM"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.host === "api.pluralpay.in" && parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "runtime-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.host === "api.pluralonline.com" && parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_customer_123");
      assert.equal(init.headers.Authorization, "Bearer runtime-access-token");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_runtime",
        payment_amount: { value: 15000, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_runtime",
        type: "RESERVE_PAY",
        payment_method_reference_id: "auth_runtime",
        expires_in: 300,
      });
    }

    if (parsed.pathname === "/api/runtime") {
      assert.equal(init.headers["X-Request-Id"], "req_123");
      assert.equal("customerKey" in init, false);
      const p3pCredential = init.headers?.["P3P-Credential"] ?? init.headers?.["p3p-credential"] ?? "";
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_runtime" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.source, "9876543210");
      assert.equal(credential.payload.customer_reference, undefined);
      assert.equal(credential.payload.mobile_number, "9876543210");
      assert.equal(credential.payload.payment_method_reference_id, "auth_runtime");
      assert.equal(credential.payload.payment_method, PaymentMethod.RESERVE_PAY);
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    autoHandlePayment: true,
    fetch: fetchImpl,
  });

  const finalResponse = await client.get(
    "https://server.example.com/api/runtime",
    { headers: { "X-Request-Id": "req_123" } },
    {
      customerKey: "ck_customer_123",
      customerReference: "cust_123",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.RESERVE_PAY,
    },
  );

  assert.equal(finalResponse.status, 200);
  assert.deepEqual(await finalResponse.json(), { ok: true });
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    [
      "server.example.com/api/runtime",
      "api.pluralpay.in/api/auth/v1/token",
      "api.pluralonline.com/api/v1/customer/mpp/token",
      "server.example.com/api/runtime",
    ],
  );
});

test("customer-key auth mode fetches bearer token and uses customer token endpoint", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_customer_key",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/customer-key",
      availablePaymentMethods: ["RESERVE_PAY"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "customer-key-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_customer_key");
      assert.equal(init.headers.Authorization, "Bearer customer-key-access-token");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_customer_key",
        payment_amount: { value: 15000, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_customer_key",
        type: "RESERVE_PAY",
        payment_method_reference_id: "auth_customer_key",
        expires_in: 300,
      });
    }

    if (parsed.pathname === "/api/customer-key") {
      const p3pCredential = init.headers?.["P3P-Credential"] ?? "";
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_customer_key" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.source, "9876543210");
      assert.equal(credential.payload.customer_reference, undefined);
      assert.equal(credential.payload.mobile_number, "9876543210");
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const finalResponse = await client.get(
    "https://server.example.com/api/customer-key",
    {},
    {
      customerKey: "ck_customer_key",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.RESERVE_PAY,
    },
  );

  assert.equal(finalResponse.status, 200);
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    [
      "server.example.com/api/customer-key",
      "pluraluat.v2.pinepg.in/api/auth/v1/token",
      "api-staging.pluralonline.com/api/v1/customer/mpp/token",
      "server.example.com/api/customer-key",
    ],
  );
});

test("client-credentials customer auth mode mints bearer token and calls central token endpoint", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_client_credentials",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "250.00",
      currency: "INR",
      resource: "/api/client-credentials",
      availablePaymentMethods: ["RESERVE_PAY"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "client-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/mpp/v1/token") {
      assert.equal(init.headers.Authorization, "Bearer client-access-token");
      assert.equal("X-Customer-Key" in init.headers, false);
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_client_credentials",
        payment_amount: { value: 25000, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_client_credentials",
        type: "RESERVE_PAY",
        payment_method_reference_id: "auth_client_credentials",
        expires_in: 300,
      });
    }

    if (parsed.pathname === "/api/client-credentials") {
      assert.equal(String(init.headers?.Authorization ?? ""), "");
      const p3pCredential = init.headers?.["P3P-Credential"] ?? "";
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_client_credentials" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.source, "9876543210");
      assert.equal(credential.payload.customer_reference, undefined);
      assert.equal(credential.payload.mobile_number, "9876543210");
      assert.equal(credential.payload.payment_method_reference_id, "auth_client_credentials");
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.ClientCredentials,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const finalResponse = await client.get(
    "https://server.example.com/api/client-credentials",
    {},
    {
      customerReference: "cust-ref-123",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.RESERVE_PAY,
    },
  );

  assert.equal(finalResponse.status, 200);
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    [
      "server.example.com/api/client-credentials",
      "pluraluat.v2.pinepg.in/api/auth/v1/token",
      "pluraluat.v2.pinepg.in/mpp/v1/token",
      "server.example.com/api/client-credentials",
    ],
  );
});

test("client defaults to client-credentials customer auth mode", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "default-client-access-token",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/mpp/v1/token") {
      assert.equal(init.headers.Authorization, "Bearer default-client-access-token");
      assert.equal("X-Customer-Key" in init.headers, false);
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_default",
        payment_amount: { value: 100, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_default",
        type: "RESERVE_PAY",
        payment_method_reference_id: "auth_default",
        expires_in: 300,
      });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const token = await client.methods.createToken({
    customerReference: "cust-ref-default",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_default",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.equal(token.token, "P3P_TOK_default");
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    [
      "pluraluat.v2.pinepg.in/api/auth/v1/token",
      "pluraluat.v2.pinepg.in/mpp/v1/token",
    ],
  );
});

test("auto handling rejects when selected payment method is not accepted by server", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_unsupported",
    realm: "Pine Labs Online P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["RESERVE_PAY"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/premium") {
      return response(
        402,
        { title: "Payment Required", status: 402, challengeId: "ch_unsupported" },
        { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
      );
    }

    return response(500, { error: "unexpected call" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () => client.get("https://api.test/api/premium", {}, {
      customerKey: "ck_test_customer",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.OTM,
    }),
    /not accepted/i,
  );
  assert.deepEqual(calls.map((call) => call.path), ["/api/premium"]);
});

test("auto handles CREDIT_EMI without changing the token request or credential method", async () => {
  const calls = [];
  const challengePayload = {
    id: "ch_credit_emi",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "10.00",
      currency: "INR",
      resource: "/api/credit-emi-premium",
      availablePaymentMethods: ["CREDIT_EMI"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });

    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "card-access-token", expires_in: 300 } });
    }

    if (parsed.pathname === "/mpp/v1/token") {
      assert.equal(init.headers.Authorization, "Bearer card-access-token");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "CREDIT_EMI",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_credit_emi",
        payment_amount: { value: 1000, currency: "INR" },
        payment_method_reference_id: "v1-sub-credit-emi-123",
      });
      return response(200, {
        data: {
          payment_token: "P3P_CREDIT_EMI_TOK_123",
          payment_method: "CREDIT_EMI",
          expires_in: 300,
        },
      });
    }

    if (parsed.pathname === "/api/credit-emi-premium") {
      const p3pCredential = init.headers?.["P3P-Credential"] ?? init.headers?.["p3p-credential"] ?? "";
      if (!String(p3pCredential).startsWith("Payment ")) {
        return response(
          402,
          { title: "Payment Required", status: 402, challengeId: "ch_card" },
          { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
        );
      }
      const credential = JSON.parse(Buffer.from(String(p3pCredential).slice("Payment ".length), "base64url").toString("utf8"));
      assert.equal(credential.payload.payment_method, PaymentMethod.CREDIT_EMI);
      assert.equal(credential.payload.payment_method_reference_id, "v1-sub-credit-emi-123");
      assert.equal(credential.payload.mobile_number, "9876543210");
      return response(200, { ok: true });
    }

    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const result = await client.get("https://merchant.test/api/credit-emi-premium", {}, {
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.CREDIT_EMI,
    paymentMethodReferenceId: "v1-sub-credit-emi-123",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/credit-emi-premium", "/api/auth/v1/token", "/mpp/v1/token", "/api/credit-emi-premium"],
  );
});

test("client runtime context rejects CRYPTO as currently unsupported", async () => {
  const challengePayload = {
    id: "ch_crypto",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["RESERVE_PAY", "OTM"],
    },
    expires: "2030-01-01T00:00:00Z",
  };
  const client = PineLabsOnlineClient.create({
    clientId: "client-client",
    clientSecret: "client-secret",
    fetch: async () => response(
      402,
      { title: "Payment Required", status: 402, challengeId: "ch_crypto" },
      { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
    ),
  });

  await assert.rejects(
    () => client.get("https://api.test/api/premium", {}, {
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.Crypto,
    }),
    /PaymentMethod\.Crypto is currently not supported in SDKs/,
  );
});

test("auto handling requires customer runtime context when config defaults are absent", async () => {
  const challengePayload = {
    id: "ch_missing_context",
    realm: "Pine Labs Online P3P",
    paymentGateway: "PINE LABS ONLINE",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "150.00",
      currency: "INR",
      resource: "/api/premium",
      availablePaymentMethods: ["RESERVE_PAY"],
    },
    expires: "2030-01-01T00:00:00Z",
  };

  const fetchImpl = async (input) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === "/api/premium") {
      return response(
        402,
        { title: "Payment Required", status: 402, challengeId: "ch_missing_context" },
        { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` },
      );
    }
    return response(500, { error: "unexpected call" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await assert.rejects(
    () => client.get("https://api.test/api/premium"),
    /ClientRuntimeContext: paymentMethod is required/i,
  );
});

test("client token surface does not create mandates or expose revoke", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "surface-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal(init.headers.Authorization, "Bearer surface-access-token");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_direct",
        payment_amount: { value: 100, currency: "INR" },
      });
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  assert.equal("revokeToken" in client.methods, false);
  assert.equal("createMandate" in client.methods, false);
  assert.equal("getMandate" in client.methods, false);
  const token = await client.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.equal(token.token, "P3P_TOK_123");
  assert.equal(token.expires_in, 300);
  assert.deepEqual(calls.map((call) => call.path), ["/api/auth/v1/token", "/api/v1/customer/mpp/token"]);
});

test("client env selects sandbox URL for token calls with bearer auth", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "sandbox-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers.Authorization, "Bearer sandbox-access-token");
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await client.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["pluraluat.v2.pinepg.in/api/auth/v1/token", "api-staging.pluralonline.com/api/v1/customer/mpp/token"],
  );
});

test("client env defaults to production when omitted by JavaScript callers", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "production-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers.Authorization, "Bearer production-access-token");
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    fetch: fetchImpl,
  });

  await client.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["api.pluralpay.in/api/auth/v1/token", "api.pluralonline.com/api/v1/customer/mpp/token"],
  );
});

test("client token creation uses staging customer token endpoint with customer key in sandbox", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ host: parsed.host, path: parsed.pathname, init });
    if (parsed.host === "pluraluat.v2.pinepg.in" && parsed.pathname === "/api/auth/v1/token") {
      assert.deepEqual(JSON.parse(init.body), {
        grant_type: "client_credentials",
        client_id: "client-client",
        client_secret: "client-secret",
      });
      return response(200, {
        data: {
          access_token: "staging-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.host === "api-staging.pluralonline.com" && parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "staging-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.host === "api-staging.pluralonline.com" && parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers.Authorization, "Bearer staging-access-token");
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.deepEqual(JSON.parse(init.body), {
        payment_method: "RESERVE_PAY",
        customer: {
          mobile_number: "9876543210",
        },
        challenge_id: "ch_direct",
        payment_amount: { value: 100, currency: "INR" },
      });
      return response(200, {
        payment_token: "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79",
        expires_in: 300,
        type: "RESERVE_PAY",
        payment_method_reference_id: "v1-sub-260527235716-aa-TmOgVb",
        payment_amount: {
          value: 300,
          currency: "INR",
        },
        customer: {
          customer_id: "cust-v1-260527235715-aa-IawrBS",
          merchant_customer_reference: "abcd0008",
          mobile_number: "9876543210",
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  const token = await client.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.equal(token.token, "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79");
  assert.equal(token.token_id, "P3P_TOK_ce52c790-9140-47b1-b92f-e7e84caadc79");
  assert.equal(token.mandate_id, "v1-sub-260527235716-aa-TmOgVb");
  assert.equal(token.customer_id, "cust-v1-260527235715-aa-IawrBS");
  assert.equal(token.customer_reference, "abcd0008");
  assert.equal(token.mobile_number, "9876543210");
  assert.deepEqual(token.payment_amount, { value: 300, currency: "INR" });
  assert.equal(token.payment_method, PaymentMethod.RESERVE_PAY);
  assert.equal(token.expires_in, 300);
  assert.deepEqual(
    calls.map((call) => `${call.host}${call.path}`),
    ["pluraluat.v2.pinepg.in/api/auth/v1/token", "api-staging.pluralonline.com/api/v1/customer/mpp/token"],
  );
});

test("P3PError parses swagger error response shapes", () => {
  const topLevel = P3PError.fromResponse(400, {
    status: 400,
    code: "INVALID_REQUEST",
    message: "customer_reference is required",
  });
  assert.equal(topLevel.code, "INVALID_REQUEST");
  assert.equal(topLevel.message, "customer_reference is required");

  const errorMap = P3PError.fromResponse(400, { error: "missing request header" });
  assert.equal(errorMap.message, "missing request header");
});

test("customer key is sent only from per-call token options", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, {
        data: {
          access_token: "per-call-access-token",
          expires_in: 300,
        },
      });
    }
    if (parsed.pathname === "/api/v1/customer/mpp/token") {
      assert.equal(init.headers["X-Customer-Key"], "ck_test_customer");
      assert.equal(init.headers.Authorization, "Bearer per-call-access-token");
      return response(200, {
        data: {
          payment_token: "P3P_TOK_123",
          type: "RESERVE_PAY",
          payment_method_reference_id: "auth_123",
          expires_in: 300,
        },
      });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    customerAuthMode: P3PCustomerAuthMode.CustomerKey,
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
  });

  await client.methods.createToken({
    customerKey: "ck_test_customer",
    customerReference: "cust-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    challengeId: "ch_direct",
    paymentAmount: { value: 100, currency: "INR" },
  });

  assert.deepEqual(calls.map((call) => call.path), ["/api/auth/v1/token", "/api/v1/customer/mpp/token"]);
});

test("client forwards and verifies Grantex grant token during automatic payment", async () => {
  let verifierCalls = 0;
  const challengePayload = {
    id: "ch_grant",
    realm: "Pine Labs Online P3P",
    intent: "charge",
    request: {
      scheme: "exact",
      amount: "1.00",
      currency: "INR",
      resource: "/api/grant",
      availablePaymentMethods: ["RESERVE_PAY"],
    },
    expires: "2030-01-01T00:00:00Z",
  };
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const parsed = new URL(String(input));
    calls.push({ path: parsed.pathname, init });
    if (parsed.pathname === "/api/auth/v1/token") {
      return response(200, { data: { access_token: "client-access-token", expires_in: 300 } });
    }
    if (parsed.pathname === "/mpp/v1/token") {
      return response(200, {
        data: {
          payment_token: "P3P_TOK_grant",
          type: "RESERVE_PAY",
          payment_method_reference_id: "auth_grant",
          expires_in: 300,
        },
      });
    }
    if (parsed.pathname === "/api/grant") {
      assert.equal(init.headers[GRANTEX_TOKEN_HEADER], "grant_token_123");
      const credential = String(init.headers["P3P-Credential"] ?? "");
      if (!credential.startsWith("Payment ")) {
        return response(402, { status: 402 }, { "WWW-Authenticate": `Payment ${encodeJson(challengePayload)}` });
      }
      return response(200, { ok: true });
    }
    return response(404, { error: "not found" });
  };

  const client = PineLabsOnlineClient.create({
    clientId: "client-client",
    clientSecret: "client-secret",
    env: P3PEnvironment.SANDBOX,
    fetch: fetchImpl,
    grantex: {
      grantToken: "grant_token_123",
      requiredScopes: ["mpp:payment:initiate"],
      enforceGrant: true,
      verifier: {
        async verify(token) {
          verifierCalls += 1;
          assert.equal(token, "grant_token_123");
          return {
            valid: true,
            grant: {
              tokenId: "tok_grant",
              grantId: "grnt_123",
              principalId: "user_123",
              agentDid: "did:web:agent",
              developerId: "dev_123",
              scopes: ["mpp:payment:*"],
              issuedAt: 1,
              expiresAt: 2,
            },
          };
        },
      },
    },
  });

  const result = await client.get(
    "https://server.test/api/grant",
    {},
    {
      customerReference: "cust-ref-123",
      mobileNumber: "9876543210",
      paymentMethod: PaymentMethod.RESERVE_PAY,
    },
  );

  assert.equal(result.status, 200);
  assert.equal(verifierCalls, 1);
  assert.deepEqual(calls.map((call) => call.path), ["/api/grant", "/api/auth/v1/token", "/mpp/v1/token", "/api/grant"]);
});

test("decodeReceipt parses Payment-Receipt headers", () => {
  const receipt = decodeReceipt(
    `Payment ${encodeJson({
      status: "success",
      paymentGateway: PaymentGateway.PineLabsOnline,
      paymentMethod: PaymentMethod.RESERVE_PAY,
      timestamp: "2030-01-01T00:00:00Z",
      reference: "cap_1",
      challengeId: "ch_1",
      settlement: { amount: "10.00", currency: "INR" },
    })}`,
  );

  assert.equal(receipt.status, "success");
  assert.equal("method" in receipt, false);
  assert.equal(receipt.paymentGateway, PaymentGateway.PineLabsOnline);
  assert.equal(receipt.paymentMethod, PaymentMethod.RESERVE_PAY);
  assert.equal(receipt.settlement.currency, "INR");
});

test("exports default P3P environments", () => {
  assert.equal(P3PEnvironment.SANDBOX, "https://pluraluat.v2.pinepg.in");
  assert.equal(P3PEnvironment.PRODUCTION, "https://api.pluralpay.in");
});
