import { Pool } from "@neondatabase/serverless";
import {
  MAX_PAYLOAD_BYTES,
  enforceRateLimit,
  getClientIp,
  hashClientIp,
  registerStudent,
  validateRegistrationPayload,
} from "../lib/registration.js";

let databasePool;
let activeConnectionString;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function getPool(connectionString) {
  if (!databasePool || activeConnectionString !== connectionString) {
    databasePool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    activeConnectionString = connectionString;
  }
  return databasePool;
}

async function readJsonPayload(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    return { error: json({ ok: false, code: "PAYLOAD_TOO_LARGE", message: "Dữ liệu gửi lên quá lớn." }, 413) };
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { error: json({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE", message: "Yêu cầu phải sử dụng JSON." }, 415) };
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYLOAD_BYTES) {
    return { error: json({ ok: false, code: "PAYLOAD_TOO_LARGE", message: "Dữ liệu gửi lên quá lớn." }, 413) };
  }

  try {
    return { payload: JSON.parse(rawBody) };
  } catch {
    return { error: json({ ok: false, code: "INVALID_JSON", message: "Dữ liệu JSON không hợp lệ." }, 400) };
  }
}

export async function handleRegister(request, overrides = {}) {
  if (request.method !== "POST") {
    return json(
      { ok: false, code: "METHOD_NOT_ALLOWED", message: "Chỉ hỗ trợ phương thức POST." },
      405,
      { Allow: "POST" },
    );
  }

  const parsed = await readJsonPayload(request);
  if (parsed.error) return parsed.error;

  const validation = validateRegistrationPayload(parsed.payload);
  if (!validation.valid) {
    return json({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Vui lòng kiểm tra lại thông tin đăng ký.",
      fields: validation.errors,
    }, 422);
  }

  const connectionString = overrides.connectionString ?? getConnectionString();
  const rateLimitSalt = overrides.rateLimitSalt ?? process.env.RATE_LIMIT_SALT ?? "";
  if ((!connectionString && !overrides.pool) || !rateLimitSalt) {
    return json({
      ok: false,
      code: "CONFIGURATION_ERROR",
      message: "Hệ thống đăng ký chưa được cấu hình đầy đủ. Vui lòng thử lại sau.",
    }, 500);
  }

  const pool = overrides.pool ?? getPool(connectionString);
  const rateLimitFn = overrides.enforceRateLimitFn ?? enforceRateLimit;
  const registerStudentFn = overrides.registerStudentFn ?? registerStudent;

  try {
    const clientIp = getClientIp(request);
    const keyHash = hashClientIp(clientIp, rateLimitSalt);
    const rateLimit = await rateLimitFn(pool, keyHash);

    if (!rateLimit.allowed) {
      return json({
        ok: false,
        code: "RATE_LIMITED",
        message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.",
      }, 429, { "Retry-After": String(rateLimit.retryAfter) });
    }

    const result = await registerStudentFn(pool, validation.data);
    if (result.status === "duplicate") {
      return json({ ok: false, code: "DUPLICATE_PHONE", message: "Số điện thoại này đã được đăng ký." }, 409);
    }
    if (result.status === "full") {
      return json({ ok: false, code: "CAPACITY_FULL", message: "Chương trình đã đủ 600 suất đăng ký." }, 409);
    }
    if (result.status !== "created") throw new Error("Unexpected registration result");

    return json({
      ok: true,
      code: "REGISTERED",
      message: "Đăng ký thành công! Thông tin của bạn đã được ghi nhận.",
    }, 201);
  } catch {
    return json({
      ok: false,
      code: "DATABASE_UNAVAILABLE",
      message: "Hệ thống đăng ký đang tạm thời gián đoạn. Vui lòng thử lại sau.",
    }, 503);
  }
}

export default {
  fetch: handleRegister,
};
