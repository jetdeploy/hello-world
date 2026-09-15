FROM python:3.14.7-slim
LABEL maintainer="JetDeploy"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --disable-pip-version-check --root-user-action=ignore --no-input --no-cache-dir -r requirements.txt

COPY . .

RUN SECRET_KEY=collectstatic DATABASE_URL=postgresql://collectstatic:collectstatic@localhost:5432/collectstatic \
    python manage.py collectstatic --noinput

RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 8080

CMD ["gunicorn", "hello_django.wsgi:application", "--bind", "0.0.0.0:8080"]
