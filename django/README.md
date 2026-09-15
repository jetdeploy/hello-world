# Django example

A Django app backed by PostgreSQL, serving its own static files. Copy this directory as the root
of your own repository (see the root [README](../README.md)) and build on it.

## Contents

- `Dockerfile` — pinned `python:3.14.7-slim`, installs pinned requirements, runs `collectstatic`
  at build time, drops to a non-root user, serves with gunicorn on `8080`.
- `requirements.txt` — `Django==5.2.17` (current LTS), `gunicorn`, `psycopg[binary]`, `whitenoise`.
- `hello_django/` — the project package: settings read entirely from the environment.
- `counter/` — a small app with one model (`Visit`) whose home page writes a row on every request
  and shows the row count, proving the migration and the database connection both work.
- `.dockerignore`

## Dockerfile choices that matter on JetDeploy

- **Port**: gunicorn binds `0.0.0.0:8080`. JetDeploy sets no `PORT` variable, so this is hardcoded.
- **SIGTERM**: `CMD` runs gunicorn directly (exec form, no shell), so it is PID 1 and receives
  `SIGTERM` straight from the container runtime; gunicorn's default handling of `SIGTERM` is a
  fast shutdown, well inside the grace period JetDeploy gives before it kills the process.
- **Proxy header**: `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")` in
  `settings.py` trusts the edge's `X-Forwarded-Proto` header instead of the raw connection;
  `SECURE_SSL_REDIRECT` is left at its default (off) since the edge already terminates HTTPS.
- **Logs**: `LOGGING` sends everything to a console handler formatted `[%(levelname)s] %(message)s`,
  so JetDeploy's log level filter recognizes the lines.
- **collectstatic in the build**: the pre-deploy script runs in its own container that shares no
  files with the app's processes, so anything that writes files — `collectstatic` here — has to
  happen in the `Dockerfile`. It runs with placeholder `SECRET_KEY`/`DATABASE_URL` values that
  only need to satisfy `settings.py` at import time; no database connection is made.
- **Non-root**: a dedicated `app` user runs gunicorn; `collectstatic` still runs as root during
  the build, before the `USER` switch, so the resulting `staticfiles/` stays root-owned but
  world-readable, which is enough for whitenoise to serve it.

## Envs

| Key | Required | Example |
| --- | --- | --- |
| `SECRET_KEY` | yes | a long random string |
| `DATABASE_URL` | yes | `postgresql://<username>:<password>@<internal_host>:<port>/<database_name>` |
| `ALLOWED_HOSTS` | yes for real traffic | `my-app.jetdeployapp.com` |
| `DEBUG` | no (default off) | `false` |

`SECRET_KEY` and `DATABASE_URL` are read with `os.environ[...]`: the app refuses to start without
them, which is intentional so a missing secret fails loudly instead of silently.

## Pod settings

`{"name": "web", "port": 8080, "external": true}`.

## Pre-deploy script

`python manage.py migrate --noinput`. It is retried once by JetDeploy on failure, and
`migrate --noinput` is safe to run twice: a second run with nothing pending just prints
"No migrations to apply."

## Deploy steps

Copy this directory to the root of a new repository first:

```
cp -r django my-app && cd my-app && git init -b main && git add -A && git commit -m "Initial commit"
```

### 1. Create the PostgreSQL service and wait for it to be ready

The pre-deploy script needs the database to exist before the first push.

As an MCP tool call: `create_service` — `{"name": "my-app-db", "kind": "postgresql", "storage_size": 1}`.

As curl:

```sh
API=https://jetdeploy.com/api/v1
TOKEN=<your API token>

SERVICE=$(curl -s -X POST $API/services \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "my-app-db", "kind": "postgresql", "storage_size": 1}')
SERVICE_ID=$(echo "$SERVICE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
```

Poll `get_service` / `GET $API/services/$SERVICE_ID` until `status` is `ready`. The answer carries
`internal_host` and `port`, and `credentials` with `username`, `password` (letters and digits only,
no percent-encoding needed) and `database_name` — build `DATABASE_URL` from them:

```
DATABASE_URL=postgresql://<credentials.username>:<credentials.password>@<internal_host>:<port>/<credentials.database_name>
```

### 2. Create the app, set envs, add the process, set the pre-deploy script

As MCP tool calls:

1. `create_app` — `{"name": "my-app", "branch": "main"}`
2. `set_envs` — `{"app_id": <id>, "envs": {"SECRET_KEY": "<random string>", "DATABASE_URL": "<from step 1>", "ALLOWED_HOSTS": "my-app.jetdeployapp.com"}}`
3. `create_pod` — `{"app_id": <id>, "name": "web", "port": 8080, "external": true}`
4. `update_app` — `{"app_id": <id>, "predeploy_script": "python manage.py migrate --noinput"}`

As curl:

```sh
APP=$(curl -s -X POST $API/apps \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "my-app", "branch": "main"}')
APP_ID=$(echo "$APP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
GIT_REMOTE=$(echo "$APP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["git_remote_url"])')

curl -s -X PUT $API/apps/$APP_ID/envs \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"envs": {"SECRET_KEY": "<random string>", "DATABASE_URL": "<from step 1>", "ALLOWED_HOSTS": "my-app.jetdeployapp.com"}}'

curl -s -X POST $API/apps/$APP_ID/pods \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "web", "port": 8080, "external": true}'

curl -s -X PATCH $API/apps/$APP_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"predeploy_script": "python manage.py migrate --noinput"}'
```

### 3. Push

```sh
GIT_TOKEN=$(curl -s $API/profile -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["git_token"]["secret"])')

JD_GIT_TOKEN=$GIT_TOKEN git -c credential.helper= \
  -c credential.helper='!f() { echo username=git; echo "password=$JD_GIT_TOKEN"; }; f' \
  push $GIT_REMOTE HEAD:refs/heads/main
```

The push output names the operation, e.g. `App deploy in progress: operation 123`. Poll it
(MCP `get_operation`, or `GET $API/operations/123`) until `is_finished` is `true` and `status` is
`SUCCESS`, then open the app's `url`.
