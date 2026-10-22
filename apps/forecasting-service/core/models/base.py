from __future__ import annotations
from abc import ABC, abstractmethod
import pandas as pd


class BaseForecaster(ABC):
    """Lớp cơ sở trừu tượng cho tất cả các mô hình dự báo nhu cầu."""

    def __init__(self, name: str):
        self.name = name
        self.is_fitted = False

    @abstractmethod
    def fit(self, series: pd.Series) -> "BaseForecaster":
        """Huấn luyện mô hình trên chuỗi thời gian Series."""
        pass

    @abstractmethod
    def predict(self, steps: int) -> list[float]:
        """Dự báo nhu cầu cho `steps` ngày tiếp theo."""
        pass
