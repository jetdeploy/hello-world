FROM python:3.11
LABEL maintainer="JetDeploy Team"

ENV PYTHONUNBUFFERED=1

COPY requirements.txt /
RUN pip install --disable-pip-version-check --root-user-action=ignore --no-input --no-cache-dir -r requirements.txt
COPY . /app
WORKDIR /app
