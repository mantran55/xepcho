# Xếp chỗ học sinh

Ứng dụng gồm hai phần độc lập:

- `site/`: HTML/CSS/JS tĩnh, đưa nguyên thư mục này lên Netlify.
- `worker/`: Cloudflare Worker làm API đọc/ghi Google Sheets.

## Chuẩn bị Google Sheets

1. Tạo Service Account trong Google Cloud, bật **Google Sheets API**, tải khóa JSON.
2. Chia sẻ spreadsheet cho email của service account với quyền **Editor**.
3. Trong `worker`, đặt secrets (không đưa file JSON lên Git):

```bash
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
wrangler secret put ALLOWED_ORIGIN
```

`GOOGLE_SERVICE_ACCOUNT_JSON` là toàn bộ nội dung file JSON service account. `ALLOWED_ORIGIN` là URL Netlify, ví dụ `https://xep-cho.netlify.app`.

Sau đó chạy `npm install` và `npm run deploy` trong thư mục `worker`.

Sau khi deploy, thay `https://YOUR-WORKER.workers.dev/api` ở đầu [site/app.js](site/app.js) bằng URL Worker thật (thêm `/api`). Đưa thư mục `site` lên Netlify bằng kéo-thả, hoặc chọn `site` làm thư mục publish.

## Quy ước sheet

- `DS`: A = Lớp, B = Tên (hàng đầu là tiêu đề).
- `Nam`: A = số bàn; các vị trí hợp lệ là những ô có viền, đọc từ trái sang phải.
- `nữ`: H = số bàn; các vị trí hợp lệ là những ô có viền, đọc từ phải sang trái.

Mỗi lần chọn, sửa hoặc xóa học sinh, ứng dụng lưu ngay vào sheet. Nút thêm chỗ tạo một vị trí trống cạnh vị trí cuối của bàn và tạo viền cho ô đó.
