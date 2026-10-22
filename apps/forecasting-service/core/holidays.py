from __future__ import annotations
import datetime


def get_vietnam_holidays(year: int) -> set[datetime.date]:
    """Trả về danh sách ngày lễ, Tết chính thức của Việt Nam theo dương lịch."""
    holidays = {
        datetime.date(year, 1, 1),   # Tết Dương lịch
        datetime.date(year, 4, 30),  # Ngày Thống nhất đất nước
        datetime.date(year, 5, 1),   # Ngày Quốc tế Lao động
        datetime.date(year, 9, 2),   # Ngày Quốc khánh
        datetime.date(year, 9, 3),   # Ngày Quốc khánh (ngày nghỉ kế tiếp)
    }

    # Ánh xạ lịch âm (Giỗ tổ Hùng Vương 10/3 âm lịch & Tết Nguyên Đán):
    if year == 2024:
        holidays.add(datetime.date(2024, 4, 18))  # Giỗ Tổ Hùng Vương
        for d in range(8, 15):                     # Tết Nguyên Đán Giáp Thìn
            holidays.add(datetime.date(2024, 2, d))
    elif year == 2025:
        holidays.add(datetime.date(2025, 4, 7))   # Giỗ Tổ Hùng Vương
        for d in range(25, 32):                    # Tết Nguyên Đán Ất Tỵ
            holidays.add(datetime.date(2025, 1, d))
        holidays.add(datetime.date(2025, 2, 1))
        holidays.add(datetime.date(2025, 2, 2))
    elif year == 2026:
        holidays.add(datetime.date(2026, 4, 26))  # Giỗ Tổ Hùng Vương
        for d in range(13, 22):                    # Tết Nguyên Đán Bính Ngọ
            holidays.add(datetime.date(2026, 2, d))
    elif year == 2027:
        holidays.add(datetime.date(2027, 4, 16))  # Giỗ Tổ Hùng Vương
        for d in range(5, 13):                     # Tết Nguyên Đán Đinh Mùi
            holidays.add(datetime.date(2027, 2, d))
    else:
        # Dự phòng cho các năm khác
        pass

    return holidays
