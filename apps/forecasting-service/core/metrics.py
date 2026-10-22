from __future__ import annotations
import math
from typing import Union, List, Dict
import numpy as np


def calculate_metrics(y_true: Union[List[float], np.ndarray], y_pred: Union[List[float], np.ndarray]) -> Dict[str, float]:
    """
    Tính toán bộ 3 chỉ số sai số chuẩn trong quản lý chuỗi cung ứng:
    - MAE: Sai số tuyệt đối trung bình
    - RMSE: Căn bậc hai sai số toàn phương trung bình (phạt nặng sai số lớn)
    - WAPE: Sai số phần trăm có trọng số (Weighted Absolute Percentage Error)
    - Accuracy: 1 - WAPE (tính theo %)
    """
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)

    if len(y_true) == 0:
        return {"mae": 0.0, "rmse": 0.0, "wape": 0.0, "accuracy": 100.0}

    # Đảm bảo không có giá trị âm trong dự báo số lượng hàng
    y_pred = np.clip(y_pred, a_min=0.0, a_max=None)

    abs_errors = np.abs(y_true - y_pred)
    mae = float(np.mean(abs_errors))
    rmse = float(math.sqrt(np.mean(np.square(abs_errors))))

    total_actual = float(np.sum(y_true))
    total_abs_error = float(np.sum(abs_errors))

    if total_actual > 0:
        wape = float(total_abs_error / total_actual)
    else:
        # Nếu tổng thực tế = 0 (tất cả các ngày đều không bán được gì)
        wape = 0.0 if total_abs_error == 0 else 1.0

    accuracy = max(0.0, round((1.0 - wape) * 100.0, 2))

    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "wape": round(wape, 4),
        "accuracy": accuracy,
    }
