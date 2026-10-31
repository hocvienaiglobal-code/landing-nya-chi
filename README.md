# Landing Page Nya Chi

Landing Page tĩnh cho chương trình **XÂY KÊNH TRIỆU VIEW BẰNG AI**, kèm
Vercel Function đăng ký học viên và Neon PostgreSQL.

## Cấu trúc

- `index.html`: giao diện, validation phía trình duyệt và kết nối form.
- `api/register.js`: `POST /api/register` trên Vercel.
- `lib/registration.js`: validation server, chuẩn hóa số điện thoại, rate limit
  và transaction đăng ký.
- `db/schema.sql`: bảng `registrations` và `registration_rate_limits`.
- `tests/registration.test.js`: kiểm thử tự động không cần database thật.

## Biến môi trường

Backend đọc chuỗi kết nối theo thứ tự:

1. `DATABASE_URL`
2. `POSTGRES_URL`

Ngoài ra cần:

- `RATE_LIMIT_SALT`: chuỗi ngẫu nhiên riêng dùng để HMAC địa chỉ IP trước khi
  lưu khóa rate limit. Không lưu IP thô.

Kiểm tra tên biến đã được Neon thêm trên Vercel:

```bash
vercel env ls
```

Tạo salt và thêm vào Production, Preview, Development theo nhu cầu:

```bash
openssl rand -hex 32
vercel env add RATE_LIMIT_SALT production
```

Không đưa giá trị thật vào `.env.example`. `.env*`, `.vercel/` và
`node_modules/` đã được loại khỏi Git.

## Khởi tạo database

Mở Neon **SQL Editor** của resource `nya-chi-registrations`, xem kỹ rồi chạy
nội dung `db/schema.sql`. Migration tạo:

- `registrations(id, full_name, phone, email, created_at)`;
- unique index cho số điện thoại đã chuẩn hóa;
- bảng rate limit chứa hash HMAC, không chứa IP thô.

Nếu bảng `registrations` đã có dữ liệu, kiểm tra và xử lý bản ghi trùng trước
khi chạy unique index.

## Chạy local bằng Vercel CLI

Yêu cầu Node.js 22+ và Vercel CLI:

```bash
npm install
vercel link
vercel env pull .env.local
vercel dev
```

Mở URL do `vercel dev` cung cấp. Không chạy bằng một static server đơn thuần
nếu cần kiểm thử `/api/register`.

Kiểm tra mã nguồn và unit test:

```bash
npm run check
npm test
```

## Các tình huống cần kiểm thử

- Payload thiếu/sai định dạng: API trả `422 VALIDATION_ERROR`.
- Cùng một số nhập dạng `091...` và `+8491...`: lần sau trả
  `409 DUPLICATE_PHONE`.
- API không giới hạn tổng số đăng ký; dữ liệu số suất hiển thị trên Landing Page
  chỉ là nội dung marketing tĩnh.
- Ngày giờ hiển thị trên Landing Page chỉ là nội dung marketing; API vẫn tiếp
  nhận đăng ký sau thời điểm đó khi dữ liệu hợp lệ.
- Quá 5 request trong 10 phút từ cùng một IP hash: trả `429 RATE_LIMITED`.
- Database gián đoạn: trả `503 DATABASE_UNAVAILABLE`; frontend giữ dữ liệu để
  người dùng thử lại.
- Mất mạng: frontend hiển thị lỗi kết nối và không xóa dữ liệu đã nhập.

Không dùng dữ liệu thật trên database Production. Dùng Neon branch/database
thử nghiệm nếu cần kiểm thử tích hợp và concurrency.

## Xác nhận dữ liệu trong Neon

Sau khi gửi một đăng ký thử có chủ đích, mở **Neon Data Editor** hoặc
**SQL Editor** và chạy:

```sql
SELECT id, full_name, phone, email, created_at
FROM registrations
ORDER BY created_at DESC
LIMIT 20;
```

Các truy vấn trên hiển thị dữ liệu cá nhân; chỉ thực hiện trong Neon console
được cấp quyền và không sao chép dữ liệu vào log công khai.

## Bảo đảm concurrency

API mở transaction, `INSERT` với `ON CONFLICT (phone) DO NOTHING`, rồi chỉ trả
thành công sau `COMMIT`. Unique index của PostgreSQL là cơ chế chống trùng an
toàn khi nhiều request cùng đăng ký một số điện thoại.

Backend không kiểm tra deadline. Ngày giờ trên Landing Page là nội dung
marketing tĩnh và không khóa form, ẩn CTA hoặc thay đổi khả năng tiếp nhận của
API.
