import assert from "node:assert/strict";
import test from "node:test";

import { P3PEnvironment, PaymentMethod } from "../dist/index.js";
import { AuthManager } from "../dist/client/auth-manager.js";

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function config() {
  return {
    selectedPaymentMethod: PaymentMethod.UPI_RESERVE_PAY,
    env: P3PEnvironment.SANDBOX,
    clientId: "client-client",
    clientSecret: "client-secret",
    maxRetries: 0,
  };
}

test("client auth manager dedupes concurrent refreshes", async () => {
  const gate = deferred();
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    await gate.promise;
    return response(200, {
      data: {
        access_token: "client-access-token",
        expires_in: 300,
      },
    });
  };

  const auth = new AuthManager(config(), P3PEnvironment.SANDBOX, fetchImpl);
  const first = auth.getAccessToken();
  const second = auth.getAccessToken();

  await Promise.resolve();
  assert.equal(calls.length, 1);

  gate.resolve();
  const [tokenA, tokenB] = await Promise.all([first, second]);
  assert.equal(tokenA, "client-access-token");
  assert.equal(tokenB, "client-access-token");
  assert.equal(calls.length, 1);
});

test("client auth manager clears failed refresh and allows retry", async () => {
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt === 1) {
      return response(500, {
        error: { code: "P3P_AUTHENTICATION_FAILED", message: "boom" },
      });
    }
    return response(200, {
      data: {
        access_token: "client-access-token",
        expires_in: 300,
      },
    });
  };

  const auth = new AuthManager(config(), P3PEnvironment.SANDBOX, fetchImpl);
  await assert.rejects(auth.getAccessToken(), /boom/);
  const token = await auth.getAccessToken();
  assert.equal(token, "client-access-token");
  assert.equal(attempt, 2);
});
