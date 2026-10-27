FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

COPY backend/ /app/
COPY frontend/ /frontend/

# Static assets are collected with the same manifest storage used at runtime.
RUN DJANGO_SECRET_KEY=build-only-not-a-real-secret-key-used-during-static-collection-2026 \
    DEBUG=False \
    ALLOWED_HOSTS=build.invalid \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    GROQ_API_KEY=build-only-key-not-used-at-runtime \
    EMAIL_HOST=build.invalid \
    DEFAULT_FROM_EMAIL=FluentAI@build.invalid \
    python manage.py collectstatic --noinput

RUN addgroup --system fluentai && adduser --system --ingroup fluentai fluentai \
    && chown -R fluentai:fluentai /app
USER fluentai

EXPOSE 8000

CMD ["gunicorn", "fluent_ai.wsgi:application", "--bind=0.0.0.0:8000", "--workers=3", "--timeout=60", "--access-logfile=-", "--error-logfile=-"]
