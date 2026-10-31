import assert from "node:assert/strict";
import test from "node:test";
import { handleRegister } from "../api/register.js";
import {
  normalizeVietnamesePhone,
  registerStudent,
  validateRegistrationPayload,
} from "../lib/registration.js";

const validPayload = {
  fullName: "  Nguyễn   Văn A  ",
  phone: "+84 912 345 678",
  email: "  TEST@example.com ",
};

function request(payload = validPayload, options = {}) {
  return new Request("http://localhost/api/register", {
    method: options.method || "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      ...options.headers,
    },
    body: options.method === "GET" ? undefined : JSON.stringify(payload),
  });
}

const allowedRateLimit = async () => ({ allowed: true, retryAfter: 300 });

async function responseBody(response) {
  return { status: response.status, body: await response.json() };
}

test("normalizes +84 and 0 formats to one canonical phone", () => {
  assert.equal(normalizeVietnamesePhone("+84 912-345-678"), "0912345678");
  assert.equal(normalizeVietnamesePhone("0912 345 678"), "0912345678");
  assert.equal(normalizeVietnamesePhone("+1 912 345 678"), null);
});

test("validates and trims all registration fields", () => {
  const result = validateRegistrationPayload(validPayload);
  assert.equal(result.valid, true);
  assert.deepEqual(result.data, {
    fullName: "Nguyễn Văn A",
    phone: "0912345678",
    email: "test@example.com",
  });
});

test("rejects invalid client payload", async () => {
  const response = await handleRegister(request({ fullName: "", phone: "123", email: "bad" }), {
    pool: {},
    rateLimitSalt: "test-salt",
  });
  const result = await responseBody(response);
  assert.equal(result.status, 422);
  assert.equal(result.body.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(result.body.fields).sort(), ["email", "fullName", "phone"]);
});

test("rejects non-POST requests", async () => {
  const response = await handleRegister(request(undefined, { method: "GET" }));
  const result = await responseBody(response);
  assert.equal(result.status, 405);
  assert.equal(result.body.code, "METHOD_NOT_ALLOWED");
  assert.equal(response.headers.get("allow"), "POST");
});

test("rejects payloads larger than 4096 bytes", async () => {
  const response = await handleRegister(request({
    fullName: "A".repeat(5000),
    phone: "0912345678",
    email: "test@example.com",
  }), {
    pool: {},
    rateLimitSalt: "test-salt",
  });
  const result = await responseBody(response);
  assert.equal(result.status, 413);
  assert.equal(result.body.code, "PAYLOAD_TOO_LARGE");
});

test("returns success only after the database workflow reports created", async () => {
  let received;
  const response = await handleRegister(request(), {
    pool: {},
    rateLimitSalt: "test-salt",
    enforceRateLimitFn: allowedRateLimit,
    registerStudentFn: async (_pool, data) => {
      received = data;
      return { status: "created", id: "1" };
    },
  });
  const result = await responseBody(response);
  assert.equal(result.status, 201);
  assert.equal(result.body.code, "REGISTERED");
  assert.equal(received.phone, "0912345678");
});

test("maps duplicate database state to DUPLICATE_PHONE", async () => {
  const response = await handleRegister(request(), {
    pool: {},
    rateLimitSalt: "test-salt",
    enforceRateLimitFn: allowedRateLimit,
    registerStudentFn: async () => ({ status: "duplicate" }),
  });
  const result = await responseBody(response);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "DUPLICATE_PHONE");
});

test("returns 429 when the database-backed rate limit is exceeded", async () => {
  const response = await handleRegister(request(), {
    pool: {},
    rateLimitSalt: "test-salt",
    enforceRateLimitFn: async () => ({ allowed: false, retryAfter: 321 }),
    registerStudentFn: async () => assert.fail("registration should not run"),
  });
  const result = await responseBody(response);
  assert.equal(result.status, 429);
  assert.equal(result.body.code, "RATE_LIMITED");
  assert.equal(response.headers.get("retry-after"), "321");
});

test("returns a retryable service error without leaking database details", async () => {
  const response = await handleRegister(request(), {
    pool: {},
    rateLimitSalt: "test-salt",
    enforceRateLimitFn: allowedRateLimit,
    registerStudentFn: async () => { throw new Error("secret database detail"); },
  });
  const result = await responseBody(response);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(result.body).includes("secret database detail"), false);
});

test("transaction inserts and commits without a total-registration check or advisory lock", async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/gu, " ").trim();
      queries.push({ text, params });
      if (text.startsWith("INSERT INTO registrations")) {
        return { rowCount: 1, rows: [{ id: "701" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };

  const result = await registerStudent(pool, {
    fullName: "Nguyễn Văn A",
    phone: "0912345678",
    email: "test@example.com",
  });

  assert.equal(result.status, "created");
  assert.deepEqual(queries.map(query => query.text.split(" ")[0]), [
    "BEGIN", "INSERT", "COMMIT",
  ]);
  assert.doesNotMatch(queries[1].text, /pg_advisory_xact_lock|COUNT\(\*\)|deadline|CURRENT_TIMESTAMP|timestamptz/iu);
  assert.deepEqual(queries[1].params, ["Nguyễn Văn A", "0912345678", "test@example.com"]);
});

test("accepts a valid registration after the marketing deadline", async () => {
  const simulatedRequestTime = Date.parse("2026-11-01T09:00:00+07:00");
  assert.ok(simulatedRequestTime > Date.parse("2026-10-31T21:00:00+07:00"));

  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/gu, " ").trim();
      queries.push({ text, params });
      if (text.startsWith("INSERT INTO registrations")) {
        return { rowCount: 1, rows: [{ id: "11" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };

  const result = await registerStudent(
    { async connect() { return client; } },
    { fullName: "Nguyễn Văn C", phone: "0976543210", email: "c@example.com" },
  );

  assert.equal(result.status, "created");
  assert.equal(queries.some(query => /deadline|CURRENT_TIMESTAMP|timestamptz/iu.test(query.text)), false);
});

test("transaction does not enforce a total registration limit", async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/gu, " ").trim();
      queries.push({ text, params });
      if (text.startsWith("INSERT INTO registrations")) {
        return { rowCount: 1, rows: [{ id: "701" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const result = await registerStudent({ async connect() { return client; } }, {
    fullName: "Nguyễn Văn B",
    phone: "0987654321",
    email: "b@example.com",
  });
  assert.equal(result.status, "created");
  assert.equal(queries.some(query => /COUNT\(\*\)|pg_advisory_xact_lock/iu.test(query.text)), false);
});

test("transaction rolls back when the phone number is already registered", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      const text = String(sql).replace(/\s+/gu, " ").trim();
      queries.push(text);
      if (text.startsWith("INSERT INTO registrations")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const result = await registerStudent({ async connect() { return client; } }, {
    fullName: "Nguyễn Văn D",
    phone: "0933333333",
    email: "d@example.com",
  });
  assert.equal(result.status, "duplicate");
  assert.deepEqual(queries.map(query => query.split(" ")[0]), ["BEGIN", "INSERT", "ROLLBACK"]);
});
