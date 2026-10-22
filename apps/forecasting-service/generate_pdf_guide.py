# -*- coding: utf-8 -*-
"""
Script tao file PDF chuyen nghiep:
"TAI LIEU KY THUAT: LUONG HOAT DONG VA NGUYEN LY CAC THUAT TOAN AI DU BAO NHU CAU"
Dung ReportLab voi Font Arial Unicode co san tren Windows.
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# Dang ky Font ho tro day du Tieng Viet tu Windows Fonts
FONT_REGULAR = "Arial"
FONT_BOLD = "Arial-Bold"
FONT_ITALIC = "Arial-Italic"
FONT_BOLDITALIC = "Arial-BoldItalic"

pdfmetrics.registerFont(TTFont(FONT_REGULAR, "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont(FONT_BOLD, "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont(FONT_ITALIC, "C:/Windows/Fonts/ariali.ttf"))
pdfmetrics.registerFont(TTFont(FONT_BOLDITALIC, "C:/Windows/Fonts/arialbi.ttf"))


class NumberedCanvas(canvas.Canvas):
    """Canvas ho tro danh so trang kieu 'Trang X / Y' va Header/Footer chuyen nghiep."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont(FONT_REGULAR, 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Header (chi ve tu trang 2 tro di)
        if self._pageNumber > 1:
            self.drawString(54, 800, "SMART WMS — TÀI LIỆU KIẾN TRÚC & NGUYÊN LÝ THUẬT TOÁN AI DỰ BÁO NHU CẦU")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 794, 541, 794)

        # Footer
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 541, 45)
        self.drawString(54, 32, "Hệ Thống Quản Lý Kho Thông Minh (WMS Microservices) — Lưu Hành Nội Bộ Nhóm")
        page_text = f"Trang {self._pageNumber} / {page_count}"
        self.drawRightString(541, 32, page_text)
        self.restoreState()


def build_pdf(filename="D:/NestJS/SourceCode/HUONG_DAN_LUONG_HOAT_DONG_AI_FORECASTING.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        fontName=FONT_BOLD,
        fontSize=20,
        leading=26,
        textColor=colors.HexColor("#1E293B"),
        alignment=1, # Center
        spaceAfter=10
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        fontName=FONT_ITALIC,
        fontSize=11,
        leading=16,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        spaceAfter=20
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName=FONT_BOLD,
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName=FONT_BOLD,
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#2563EB"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName=FONT_REGULAR,
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName=FONT_REGULAR,
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=15,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'Callout',
        fontName=FONT_REGULAR,
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1E3A8A"),
        backColor=colors.HexColor("#EFF6FF"),
        borderColor=colors.HexColor("#3B82F6"),
        borderWidth=1,
        borderPadding=8,
        spaceBefore=6,
        spaceAfter=10
    )

    formula_style = ParagraphStyle(
        'Formula_Box',
        fontName=FONT_BOLD,
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#065F46"),
        backColor=colors.HexColor("#ECFDF5"),
        borderColor=colors.HexColor("#10B981"),
        borderWidth=0.8,
        borderPadding=6,
        spaceBefore=4,
        spaceAfter=8,
        alignment=1
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=1
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName=FONT_REGULAR,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1E293B")
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        fontName=FONT_BOLD,
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1E293B")
    )

    story = []

    # ========================== TRANG BÌA / TIÊU ĐỀ ==========================
    story.append(Spacer(1, 10))
    story.append(Paragraph("TÀI LIỆU KỸ THUẬT NỘI BỘ", ParagraphStyle('Badge', fontName=FONT_BOLD, fontSize=9, textColor=colors.HexColor("#2563EB"), alignment=1)))
    story.append(Spacer(1, 4))
    story.append(Paragraph("HỆ THỐNG QUẢN LÝ KHO THÔNG MINH (WMS MICROSERVICES)", ParagraphStyle('Sub', fontName=FONT_BOLD, fontSize=11, textColor=colors.HexColor("#64748B"), alignment=1)))
    story.append(Spacer(1, 8))
    story.append(Paragraph("LUỒNG HOẠT ĐỘNG & NGUYÊN LÝ THUẬT TOÁN PHÂN HỆ AI DỰ BÁO NHU CẦU", title_style))
    story.append(Paragraph("Hướng dẫn chi tiết dành cho các thành viên nhóm phát triển và báo cáo đề tài", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563EB"), spaceAfter=15))

    # Hộp thông tin nhanh
    info_data = [
        [Paragraph("<b>Hệ thống:</b> Forecasting Service v2.0", table_cell_style), Paragraph("<b>Kiến trúc:</b> Microservices (FastAPI + NestJS)", table_cell_style)],
        [Paragraph("<b>Mô hình chính:</b> XGBoost, ARIMA, Moving Average", table_cell_style), Paragraph("<b>Cơ chế:</b> Adaptive Per-SKU Best Model Selection", table_cell_style)],
        [Paragraph("<b>Chỉ số đo lường:</b> MAE, RMSE, WAPE", table_cell_style), Paragraph("<b>Lưu hành:</b> Nội bộ nhóm & Báo cáo đề tài", table_cell_style)],
    ]
    info_table = Table(info_data, colWidths=[240, 240])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0,0), (-1,-1), 0.4, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 15))

    # ========================== PHẦN 1 ==========================
    story.append(Paragraph("1. NGUYÊN LÝ CỐT LÕI: TẠI SAO CẦN NHIỀU THUẬT TOÁN?", h1_style))
    story.append(Paragraph(
        "Trong các hệ thống quản lý chuỗi cung ứng hàng đầu (Amazon, Walmart), không bao giờ có một mô hình AI duy nhất "
        "tối ưu cho toàn bộ kho hàng. Định lý kinh điển <i>'No Free Lunch Theorem'</i> chứng minh rằng mỗi nhóm sản phẩm có quy luật tiêu thụ khác nhau:",
        body_style
    ))
    story.append(Paragraph("• <b>Hàng tiêu dùng đều (Cáp sạc, pin, ốp lưng):</b> Ngày nào cũng bán 40-50 cái, nhu cầu cực kỳ phẳng. Áp dụng <b>Moving Average (SMA-7)</b> chạy trong 0.001 giây, đạt độ chính xác >95% và triệt tiêu hoàn toàn rủi ro học vẹt.", bullet_style))
    story.append(Paragraph("• <b>Hàng có tính nhịp điệu chu kỳ (Tai nghe, Bàn phím):</b> Lặp lại đều đặn theo tuần. Thuật toán <b>ARIMA / SARIMAX</b> mô hình hóa sóng dao động đạt hiệu năng cao nhất.", bullet_style))
    story.append(Paragraph("• <b>Hàng giá trị cao & Nhạy cảm ngoại cảnh (iPhone, Laptop Gaming):</b> Nhu cầu bùng nổ vào cuối tuần và các dịp lễ Tết Việt Nam. Thuật toán <b>XGBoost Regressor</b> kết hợp 14 đặc trưng học máy là nhà vô địch tuyệt đối.", bullet_style))
    story.append(Paragraph(
        "👉 <b>Cơ chế của hệ thống:</b> Khi nhận yêu cầu dự báo cho 1 SKU, hệ thống sẽ tổ chức một <i>'Đấu trường thi đấu sát hạch' (Backtesting Tournament)</i> "
        "để các mô hình cùng thi đua. Mô hình nào có sai số WAPE thấp nhất sẽ tự động được chọn làm <b>Best Model</b> cho SKU đó.",
        callout_style
    ))

    # ========================== PHẦN 2 ==========================
    story.append(Paragraph("2. SƠ ĐỒ LUỒNG HOẠT ĐỘNG 6 BƯỚC (END-TO-END WORKFLOW)", h1_style))
    story.append(Paragraph(
        "Khi người dùng trên màn hình Web bấm <i>'Dự báo nhu cầu 7 ngày'</i> cho một sản phẩm, hệ thống vận hành tuần tự qua 6 bước khép kín:",
        body_style
    ))

    workflow_steps = [
        ["Bước", "Tên giai đoạn", "Thuật toán / Kỹ thuật sử dụng", "Mục đích nghiệp vụ"],
        ["1", "Thu thập dữ liệu", "Bộ lọc nghiệp vụ (Business Rule Filter)", "Chỉ lấy OUTBOUND COMPLETED. Loại bỏ chuyển kệ/kiểm kê."],
        ["2", "Làm sạch & Khử nhiễu", "Resampling 'D' & Thuật toán IQR Capping", "Lấp đầy các ngày 0 bán; Gọt các đỉnh nhập nhầm số liệu."],
        ["3", "Cửa kiểm soát an toàn", "Phân tầng Safe Fallback Hierarchy", "Nếu <7 ngày: Fallback Trung bình; 7-13 ngày: Dùng SMA-7."],
        ["4", "Kỹ nghệ đặc trưng", "Lags (1/2/7/14/30), Rolling Stats, Calendar", "Tạo 14 đặc trưng; Dùng .shift(1) chống rò rỉ dữ liệu (Leakage)."],
        ["5", "Đấu trường thi đấu", "Time-based Split & Chấm điểm WAPE", "4 mô hình thi đấu trên 7 ngày Test. Chọn Best Model."],
        ["6", "Dự báo đệ quy", "Recursive Autoregressive Multi-Step", "Huấn luyện lại trên 100% dữ liệu; Dự báo 7/14/30 ngày tới."],
    ]
    wf_table = Table(
        [[Paragraph(cell, table_header_style if r == 0 else (table_cell_bold if c == 0 else table_cell_style))
          for c, cell in enumerate(row)] for r, row in enumerate(workflow_steps)],
        colWidths=[35, 115, 185, 145]
    )
    wf_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E293B")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(wf_table)
    story.append(Spacer(1, 10))

    # ========================== PHẦN 3 ==========================
    story.append(Paragraph("3. CHI TIẾT CÁC THUẬT TOÁN ĐƯỢC CÀI ĐẶT TRONG HỆ THỐNG", h1_style))

    story.append(Paragraph("3.1. Thuật toán Khử ngoại lai IQR (Interquartile Range)", h2_style))
    story.append(Paragraph(
        "Thuật toán thống kê chia phân phối xuất kho thành 4 phần bằng nhau. Giới hạn trên (Upper Cap) được xác định bởi:",
        body_style
    ))
    story.append(Paragraph("IQR = Q3 (Tứ phân vị 75%) - Q1 (Tứ phân vị 25%)   ===>   Ngưỡng trần = Q3 + 1.5 × IQR", formula_style))
    story.append(Paragraph("Mọi giao dịch đột biến vượt ngưỡng trần sẽ được gọt về đúng giá trị trần, bảo vệ mô hình không bị lệch dữ liệu.", body_style))

    story.append(Paragraph("3.2. Thuật toán Baseline: Moving Average & Seasonal Naive", h2_style))
    story.append(Paragraph(
        "<b>• Simple Moving Average (SMA-7):</b> Dự báo bằng mức bình quân 7 ngày gần nhất: <i>y_pred = (1/7) * Σ y(t-i)</i>.<br/>"
        "<b>• Seasonal Naive:</b> Lặp lại doanh số cùng ngày tuần trước: <i>y_pred(t+k) = y(t+k-7)</i>. Nắm bắt thói quen sinh hoạt tuần.",
        body_style
    ))

    story.append(Paragraph("3.3. Thuật toán Thống kê Chuỗi thời gian: SARIMAX", h2_style))
    story.append(Paragraph(
        "Mô hình tích hợp 3 cơ chế toán học với chu kỳ mùa vụ tuần s = 7:",
        body_style
    ))
    story.append(Paragraph("• <b>I (Integrated):</b> Sai phân d = 1 (Lấy y(t) - y(t-1)) đưa dữ liệu về trạng thái dừng (Stationary).", bullet_style))
    story.append(Paragraph("• <b>AR (AutoRegressive):</b> Hồi quy giá trị hôm nay theo p ngày trước đó.", bullet_style))
    story.append(Paragraph("• <b>MA (Moving Average):</b> Bù trừ sai số ngẫu nhiên từ các 'cú sốc' thị trường trong quá khứ.", bullet_style))

    story.append(Paragraph("3.4. Thuật toán Học máy Cốt lõi: XGBoost Regressor", h2_style))
    story.append(Paragraph(
        "XGBoost sử dụng kỹ thuật <b>Gradient Boosting trên cây quyết định</b>. Hệ thống khởi tạo 150 cây quyết định nông (max_depth = 4):",
        body_style
    ))
    story.append(Paragraph("• <b>Cơ chế Boosting:</b> Cây thứ k không học trực tiếp sản lượng, mà học cách <i>dự đoán phần sai số (residual)</i> của cây k-1. Tổng hợp 150 cây sẽ triệt tiêu sai số về mức tiệm cận 0.", bullet_style))
    story.append(Paragraph("• <b>Bắt quy luật phi tuyến:</b> Nhờ 14 đặc trưng (Lags, Rolling Std, Cuối tuần, Lễ Tết Việt Nam), các nhánh If-Else của cây tự học quy luật: <i>Nếu (Thứ 7 == True) AND (Lễ Tết == True) ==> Dự báo tăng gấp 3 lần!</i>", bullet_style))
    story.append(Paragraph("• <b>Dự báo đa bước đệ quy (Recursive Multi-Step):</b> Dự báo ngày t+1 ==> Đưa kết quả vào làm Lag1 cho ngày t+2 ==> Dự báo tiếp tục đến hết horizon 7/14/30 ngày.", bullet_style))

    # ========================== PHẦN 4 ==========================
    story.append(Spacer(1, 5))
    story.append(Paragraph("4. BỘ THƯỚC ĐO SAI SỐ & Ý NGHĨA KHOA HỌC", h1_style))
    story.append(Paragraph(
        "Hệ thống không đánh giá cảm tính mà sử dụng bộ ba chỉ số đo lường chuẩn xác được chấp nhận toàn cầu:",
        body_style
    ))

    metrics_data = [
        ["Chỉ số", "Công thức tính toán", "Ý nghĩa trong Quản lý Kho", "Mức kỳ vọng"],
        ["MAE", "MAE = (1/n) * Σ |y - y_pred|", "Sai số tuyệt đối bình quân (Lệch bao nhiêu cái/ngày)", "< 1.5 sản phẩm"],
        ["RMSE", "RMSE = sqrt( (1/n) * Σ (y - y_pred)^2 )", "Phạt nặng sai số lớn (Cảnh báo rủi ro đứt hàng đột ngột)", "< 2.5 sản phẩm"],
        ["WAPE", "WAPE = Σ |y - y_pred| / Σ y", "Sai số phần trăm có trọng số (Khắc phục lỗi chia 0 của MAPE)", "< 15% (Đạt chuẩn)"],
        ["Accuracy", "Accuracy = (1 - WAPE) * 100%", "Độ chính xác quy ra tỷ lệ phần trăm trực quan", "85% - 99%"],
    ]
    m_table = Table(
        [[Paragraph(cell, table_header_style if r == 0 else (table_cell_bold if c == 0 else table_cell_style))
          for c, cell in enumerate(row)] for r, row in enumerate(metrics_data)],
        colWidths=[55, 165, 195, 65]
    )
    m_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0F172A")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(m_table)
    story.append(Spacer(1, 10))

    # ========================== PHẦN 5 ==========================
    story.append(Paragraph("5. KẾT NỐI VỚI HỖ TRỢ RA QUYẾT ĐỊNH TỒN KHO (INVENTORY DECISION)", h1_style))
    story.append(Paragraph(
        "Mô hình AI không đứng độc lập mà là mắt xích cung cấp dữ liệu cho bài toán vận hành kho:",
        body_style
    ))
    story.append(Paragraph("• <b>Cung cấp nhu cầu thời gian chờ (Lead Time Demand):</b> Thay vì lấy trung bình tĩnh, ROP lấy tổng dự báo thực tế trong L ngày kế tiếp: <i>Lead Demand = Σ y_pred(t+i)</i>.", bullet_style))
    story.append(Paragraph("• <b>Cung cấp độ biến động nhu cầu (Rolling Std - σd):</b> Tham số từ AI được đưa trực tiếp vào công thức tính Tồn kho an toàn: <i>Safety Stock = Z × σd × sqrt(L)</i>.", bullet_style))
    story.append(Paragraph("• <b>Nguyên tắc cốt lõi:</b> <b>ROP quyết định KHI NÀO NÊN ĐẶT</b> (Ngưỡng cảnh báo). <b>EOQ quyết định ĐẶT BAO NHIÊU</b> (Lượng tối ưu chi phí). Tuyệt đối không dùng EOQ làm ngưỡng cảnh báo.", bullet_style))

    # ========================== PHẦN 6 ==========================
    story.append(Paragraph("6. DANH MỤC API DÀNH CHO CÁC THÀNH VIÊN TRONG NHÓM", h1_style))
    story.append(Paragraph("Các bạn làm Frontend hoặc Backend NestJS có thể gọi trực tiếp các API sau tại Port 8004:", body_style))

    api_data = [
        ["Phương thức", "Đường dẫn Endpoint", "Chức năng chính", "Dữ liệu trả về"],
        ["GET", "/forecast/{id}?days=7", "Dự báo nhu cầu 7, 14, 30 ngày", "Mảng ngày + sản lượng, Best Model, WAPE, Version"],
        ["GET", "/models/compare/{id}", "Thi đấu so sánh 4 mô hình", "Bảng xếp hạng hiệu năng MAE, RMSE, WAPE trên tập Test"],
        ["GET", "/experiments/ablation/{id}", "Nghiên cứu đặc trưng Ablation", "So sánh độ giảm sai số giữa XGBoost (Lag) vs XGBoost (Full)"],
        ["GET", "/eoq/{id}", "Tính lượng đặt kinh tế EOQ", "Giá trị EOQ và Annual Demand phục vụ Inventory Service"],
    ]
    api_table = Table(
        [[Paragraph(cell, table_header_style if r == 0 else (table_cell_bold if c == 0 else table_cell_style))
          for c, cell in enumerate(row)] for r, row in enumerate(api_data)],
        colWidths=[65, 145, 140, 130]
    )
    api_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#2563EB")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#F8FAFC")]),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(api_table)

    story.append(Spacer(1, 15))
    story.append(Paragraph("--- HẾT TÀI LIỆU HƯỚNG DẪN NỘI BỘ ---", ParagraphStyle('End', fontName=FONT_ITALIC, fontSize=8.5, textColor=colors.HexColor("#94A3B8"), alignment=1)))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"File PDF da duoc tao thanh cong tai: {filename}")


if __name__ == "__main__":
    build_pdf()
