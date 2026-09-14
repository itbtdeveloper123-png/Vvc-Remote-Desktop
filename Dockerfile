FROM python:3.11-slim

WORKDIR /app

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/relay_server.py .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn relay_server:app --host 0.0.0.0 --port ${PORT:-8000}"]
