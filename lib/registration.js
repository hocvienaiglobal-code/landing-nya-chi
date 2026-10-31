import { createHmac } from "node:crypto";

export const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const MAX_PAYLOAD_BYTES = 4096;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const VIETNAM_MOBILE_PATTERN = /^0(?:3|5|7|8|9)\d{8}$/u;

export function normalizeVietnamesePhone(value) {
  if (typeof value !== "string") return null;

  const input = value.normalize("NFKC").trim();
  if (!input || !/^[+\d\s().-]+$/u.test(input)) return null;

  const digits = input.replace(/\D/g, "");
  const canonical = digits.startsWith("84") ? `0${digits.slice(2)}` : digits;

  return VIETNAM_MOBILE_PATTERN.test(canonical) ? canonical : null;
}

export function validateRegistrationPayload(payload) {
  const errors = {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: { form: "Dữ liệu đăng ký không hợp lệ." } };
  }

  const fullName = typeof payload.fullName === "string"
    ? payload.fullName.normalize("NFC").trim().replace(/\s+/gu, " ")
    : "";
  const phone = normalizeVietnamesePhone(payload.phone);
  const email = typeof payload.email === "string"
    ? payload.email.normalize("NFKC").trim().toLowerCase()
    : "";

  if (!fullName) errors.fullName = "Vui lòng nhập họ và tên.";
  else if (fullName.length > 100 || /[\u0000-\u001F\u007F]/u.test(fullName)) {
    errors.fullName = "Họ và tên không hợp lệ hoặc vượt quá 100 ký tự.";
  }

  if (!phone) errors.phone = "Vui lòng nhập số điện thoại Việt Nam hợp lệ.";

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: { fullName, phone, email },
  };
}

export function getClientIp(request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  return forwarded.split(",")[0].trim() || "unknown";
}

export function hashClientIp(ip, salt) {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export async function enforceRateLimit(
  pool,
  keyHash,
  {
    windowSeconds = RATE_LIMIT_WINDOW_SECONDS,
    maxAttempts = RATE_LIMIT_MAX_ATTEMPTS,
  } = {},
) {
  const result = await pool.query(
    `WITH updated AS (
       INSERT INTO registration_rate_limits AS limits
         (key_hash, window_started_at, attempt_count)
       VALUES ($1, CURRENT_TIMESTAMP, 1)
       ON CONFLICT (key_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
             THEN CURRENT_TIMESTAMP
           ELSE limits.window_started_at
         END,
         attempt_count = CASE
           WHEN limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
             THEN 1
           ELSE limits.attempt_count + 1
         END
       RETURNING attempt_count, window_started_at
     )
     SELECT
       attempt_count,
       GREATEST(
         1,
         CEIL(EXTRACT(EPOCH FROM (
           window_started_at + ($2 * INTERVAL '1 second') - CURRENT_TIMESTAMP
         )))::integer
       ) AS retry_after
     FROM updated`,
    [keyHash, windowSeconds],
  );

  const row = result.rows[0];
  return {
    allowed: Number(row.attempt_count) <= maxAttempts,
    retryAfter: Number(row.retry_after),
  };
}

export async function registerStudent(pool, registration) {
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const insertResult = await client.query(
      `INSERT INTO registrations (full_name, phone, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO NOTHING
       RETURNING id::text AS id`,
      [registration.fullName, registration.phone, registration.email],
    );

    if (insertResult.rowCount !== 1) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return { status: "duplicate" };
    }

    await client.query("COMMIT");
    transactionOpen = false;
    return { status: "created", id: insertResult.rows[0].id };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original error and never log submitted personal data.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
