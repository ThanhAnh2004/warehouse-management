# Data Processing Service

Dịch vụ **tiền xử lý dữ liệu** (data preprocessing) trong kiến trúc microservice của hệ thống
Quản lý kho. Đây là service số 6 theo yêu cầu đề tài: *"thu thập dữ liệu thô từ kho, làm sạch
và chuẩn hóa định dạng để đảm bảo mô hình dự báo luôn nhận được dữ liệu 'sạch' và chính xác"*.

## Vai trò trong hệ thống

```
Transaction Service (PostgreSQL: bảng transactions - dữ liệu thô)
        │  (đọc dữ liệu OUTBOUND)
        ▼
Data Processing Service  ──►  làm sạch + chuẩn hóa  ──►  trả về chuỗi thời gian "sạch"
        ▲
        │  (HTTP GET /process/{product_id})
Forecasting Service  ──►  huấn luyện Linear Regression  ──►  dự báo nhu cầu
```

Trước đây, toàn bộ khâu tiền xử lý bị **nhúng chung** bên trong Forecasting Service. Nay đã được
tách ra thành service độc lập, đúng nguyên tắc "mỗi service một chức năng" của microservice.

## Công nghệ

- Python 3.9 + FastAPI + Uvicorn
- pandas (làm sạch & chuẩn hóa dữ liệu)
- psycopg2 (kết nối PostgreSQL của Transaction Service)

## Các bước xử lý

**1. Thu thập (Collect)** — Truy vấn các giao dịch `OUTBOUND` của 1 sản phẩm trong `lookback_days` ngày gần nhất.

**2. Làm sạch (Clean)**
- Loại giao dịch trùng lặp (theo `id`).
- Chỉ giữ giao dịch `COMPLETED` (bỏ PENDING/FAILED — chưa xác nhận hoặc lỗi).
- Loại bản ghi số lượng null / âm / bằng 0.
- Chặn outlier bằng phương pháp **IQR** (Interquartile Range) để tránh làm lệch mô hình.

**3. Chuẩn hóa (Normalize)**
- Gom nhóm số lượng xuất kho theo ngày.
- Resample theo ngày, lấp đầy ngày không có giao dịch bằng `0` (chuỗi thời gian liên tục).
- Sinh feature `dayIndex` (số ngày kể từ ngày đầu tiên) phục vụ huấn luyện.

## API

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/health` | Kiểm tra service sống |
| GET | `/process/{product_id}?lookback_days=180` | Trả về dữ liệu đã làm sạch & chuẩn hóa + thống kê của 1 sản phẩm |
| GET | `/quality/overview?lookback_days=180` | Tổng quan chất lượng dữ liệu toàn kho (số bản ghi bị loại ở từng bước) |

### Ví dụ response `/process/{product_id}`

```json
{
  "productId": "abc-123",
  "series": [
    { "date": "2026-07-01", "quantity": 12.0, "dayIndex": 0 },
    { "date": "2026-07-02", "quantity": 0.0,  "dayIndex": 1 }
  ],
  "stats": {
    "raw": 40,
    "afterDedup": 40,
    "afterStatusFilter": 38,
    "afterInvalidFilter": 37,
    "outliersCapped": 1,
    "cleaned": 37
  },
  "dateRange": { "start": "2026-07-01", "end": "2026-07-02" },
  "processedAt": "2026-07-18T10:00:00Z"
}
```

Trường `stats` cho thấy rõ đã lọc bỏ bao nhiêu bản ghi rác ở từng bước — rất hữu ích để minh họa
khâu "làm sạch dữ liệu" khi bảo vệ đồ án.

## Chạy service

### Trong Docker (khuyến nghị)
Đã được khai báo trong `docker-compose.yml`. Chỉ cần:
```bash
docker compose up --build data-processing-service
```

### Chạy lẻ (local, ngoài Docker)
```bash
cd apps/data-processing-service
python -m venv venv && source venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
python main.py     # chạy tại http://localhost:8005
```
Cần PostgreSQL của Transaction Service đang chạy. Đọc cấu hình DB từ biến môi trường
(`POSTGRES_HOST`, `POSTGRES_DB_TRANSACTION`, ...) — xem `.env.example` ở thư mục gốc.

## Test nhanh
```bash
# Health check
curl http://localhost:8005/health

# Lấy dữ liệu đã xử lý cho 1 sản phẩm (thay <productId> bằng id thật)
curl "http://localhost:8005/process/<productId>?lookback_days=180"

# Qua reverse-proxy nginx
curl "http://localhost/process/<productId>"
```
