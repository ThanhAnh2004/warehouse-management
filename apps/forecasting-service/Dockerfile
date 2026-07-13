FROM python:3.9-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y libpq-dev gcc

# Copy requirements if exists, else install directly
# Since we might not have requirements.txt, we install known deps
RUN pip install fastapi uvicorn psycopg2-binary pandas scikit-learn python-dotenv

# Copy source
COPY . .

# Expose port
EXPOSE 8004

CMD ["python", "main.py"]
