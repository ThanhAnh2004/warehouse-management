FROM python:3.9-slim

WORKDIR /app

# gcc: can cho viec build mot so wheel khoa hoc du lieu tren image slim
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Expose port
EXPOSE 8004

CMD ["python", "main.py"]
