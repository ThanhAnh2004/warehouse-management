FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y libpq-dev gcc

RUN pip install fastapi uvicorn pandas psycopg2-binary python-dotenv

COPY . .

EXPOSE 8005

CMD ["python", "main.py"]
