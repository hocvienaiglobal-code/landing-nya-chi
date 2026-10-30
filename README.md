# Landing Reels Clone v2 — sát giao diện trang gốc của bạn

Dựa trên kiểm tra trực quan trang gốc ngày 29/10/2026 (chỉ đọc, không bấm
link, không đăng nhập, không tải tài nguyên trong lần kiểm tra đó).

## Điểm khác v1, bám sát bản gốc hơn

- Thanh thông báo vàng kem trên cùng + header xanh đậm + menu + nút vàng kem.
- Hero xanh đậm 2 cột: văn bản trái, ảnh vòm phải, headline 3 dòng
  trắng + vàng kem, khung dẫn có vạch vàng, chips nền tảng, pill 68 suất,
  nút vàng kem, 3 thẻ nhỏ dưới ảnh hero.
- Thứ tự section gốc: Về cô Nga (nền kem, thẻ ảnh xanh đậm) → Kênh của
  cô Nga (3 thẻ) → Video giới thiệu 60 giây → Nỗi đau (6 thẻ) → Được gì
  (5 thẻ) → Kênh học viên (2 thẻ) → Kết quả học viên → Cảm nhận →
  Lộ trình 8 nội dung (poster) → Quy trình 5 bước → Video mẫu (6 thẻ +
  bộ lọc + danh sách ngành) → App làm video (3 bước + demo Drive) →
  AI Auto 360 (15 thẻ + 5 bước + demo Drive) → Cộng đồng (4 ảnh) →
  FAQ (5 câu) → Chốt xanh đậm (ảnh vest hồng + QR + ô link) → Footer →
  Thanh sticky cuối màn hình.
- Nút CTA vàng kem, chữ xanh đậm, in hoa, có ↗, trỏ về cùng nhóm Zalo
  của bạn như trang gốc. Link video Drive và Facebook cảm nhận cũng giữ
  nguyên như trang gốc.

## Lưu ý chưa xác định từ lần kiểm tra

- Mã hex và tên font chính xác KHÔNG đọc được từ công cụ kiểm tra, nên
  màu xanh đậm / vàng kem trong bản này là màu ước lượng theo thị giác,
  không phải mã hex gốc đã xác thực. Font dùng Be Vietnam Pro (sans-serif,
  hỗ trợ tiếng Việt) để gần với cảm giác gốc.
- Hành vi mobile chưa được kiểm tra trên trang gốc; bản này dùng bố cục
  1 cột dưới 800px và vẫn giữ thanh sticky.
- URL ảnh kết quả học viên, ảnh bình luận cảm nhận và 10 video mẫu ẩn
  chưa trích xuất được, nên các ô đó đang là placeholder — thay bằng
  file ảnh gốc của bạn khi host chính thức.

## Ảnh: đang trỏ tới trang gốc của bạn

`index.html` hiện trỏ trực tiếp tới
`https://co-nga-khoa-hoc-reels-tu-dong.nganguyendatxanh168.chatgpt.site/assets/...`
để preview giống bản gốc ngay. Khi host chính thức, copy toàn bộ ảnh
đó về `assets/` của bản này và đổi `src` thành đường dẫn tương đối,
tránh phụ thuộc vào domain gốc.

## Deploy

Đây là trang tĩnh, không cần backend. Host bằng Netlify Drop /
Cloudflare Pages / Vercel / GitHub Pages, thư mục publish là thư mục
chứa `index.html` này, rồi trỏ domain riêng của bạn vào host đó.
