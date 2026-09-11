FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    COMEPLAYERS_WSGI_BOOTSTRAP=1 \
    COMEPLAYERS_EVENT_WEBHOOK_URL=https://www.comeplayers.com/api/games/empires-allies/events

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-comeplayers.txt ./requirements-comeplayers.txt
RUN pip install --no-cache-dir -r requirements-comeplayers.txt

COPY . .
RUN python inflate_deploy_assets.py
RUN mkdir -p /app/instance /app/data /app/logs

EXPOSE 5005

CMD ["sh", "-c", "python prepare_volume_assets.py & exec gunicorn --worker-class gthread --workers 1 --threads 8 --bind 0.0.0.0:${PORT:-5005} --timeout 240 --access-logfile - --error-logfile - comeplayers_server:app"]
