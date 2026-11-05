# hello-world

Reference example apps for [JetDeploy](https://jetdeploy.com), one directory per stack. Each one
is a minimal, working app whose Dockerfile follows JetDeploy's build and runtime contract exactly,
meant to be copied wholesale as the starting point for a real app, or read by an AI agent as a
model for a Dockerfile it has to write for someone.

## Examples

| Directory | Stack | Data service | Pre-deploy script |
| --- | --- | --- | --- |
| [`nginx/`](nginx/) | Static site (nginx) | none | none |
| [`django/`](django/) | Django + PostgreSQL | PostgreSQL | `python manage.py migrate --noinput` |
| [`nextjs/`](nextjs/) | Next.js App Router (standalone) | none | none |

Each directory has its own README with the exact envs, pod settings and deploy steps for that
stack.

## Using an example

Every example directory is meant to become the **root** of your own git repository — JetDeploy
builds `docker buildx build` at the root of the repository you push, so the Dockerfile has to sit
there, not one level down:

```sh
cp -r django my-app
cd my-app
git init -b main
git add -A
git commit -m "Initial commit"
```

Then follow that stack's README for the envs, the pod and (if it needs one) the pre-deploy script
and the data service to create, before pushing.

## How a deploy works on JetDeploy

This is the common flow every example README follows, as MCP tool calls (`https://jetdeploy.com/mcp`,
over OAuth) and as `curl` calls against the API (`https://jetdeploy.com/api/v1`, with
`Authorization: Bearer <API token>`):

1. **Create the app** — MCP `create_app`, or `POST /api/v1/apps` with `{"name": ..., "branch": "main"}`.
   The answer carries `id`, `git_remote_url` and `url`. App and service names share one namespace
   across every organization, and a free name becomes the app's default host,
   `<name>.jetdeployapp.com`.
2. **Set env vars, if any** — MCP `set_envs`, or `PUT /api/v1/apps/{app_id}/envs` with
   `{"envs": {...}}`.
3. **Add the process** — MCP `create_pod`, or `POST /api/v1/apps/{app_id}/pods` with
   `{"name": "web", "port": 8080, "external": true}`. The process must listen on `0.0.0.0:8080`;
   JetDeploy sets no `PORT` variable.
4. **Set the pre-deploy script, if any, before pushing** — MCP `update_app`, or
   `PATCH /api/v1/apps/{app_id}` with `{"predeploy_script": "..."}`. It runs after the build and
   before the new version takes traffic, in its own container with the app's env vars but sharing
   no files with the app's processes — anything that writes files (e.g. `collectstatic`) belongs
   in the Dockerfile instead.
5. **Push the code** — the only step that isn't an API call. Get the Git Access Token from MCP
   `get_profile` (or the `git_remote_with_token` MCP `create_app`/`get_app` already return), field
   `git_token.secret`, username `git`:
   ```sh
   git -c credential.helper= \
     -c credential.helper='!f() { echo username=git; echo "password=$JD_GIT_TOKEN"; }; f' \
     push <git_remote_url> HEAD:refs/heads/main
   ```
   Once the app has a pod, the push itself starts the build and deploy; git's own output names the
   operation.
6. **Poll the operation** — MCP `get_operation`, or `GET /api/v1/operations/{id}`, until
   `is_finished` is `true` and `status` is `SUCCESS`. Build logs: MCP `get_app_deploy_logs`, or
   `GET /api/v1/apps/{app_id}/deploy-logs/tail`. App logs: MCP `get_app_logs`, or
   `GET /api/v1/apps/{app_id}/logs/tail`.
7. **The app answers at its `url`.**

Every app that needs one (PostgreSQL, MariaDB, Redis, OpenSearch, RabbitMQ) is created with MCP
`create_service`, or `POST /api/v1/services` with `{"name": ..., "kind": ..., "storage_size": <GiB>}`
(the django example covers this for PostgreSQL). Nothing is injected into the app automatically —
its credentials are read from `GET /api/v1/services/{service_id}` and set as env vars by hand.

## Shared contract across every example

- **Build**: CodeBuild runs `docker buildx build` for `linux/amd64` at the root of the pushed
  repository — Dockerfile at the root, no build args, no build-time secrets, no env vars visible
  to the build.
- **Runtime**: the process listens on `0.0.0.0:8080`; readiness is a plain TCP check on that port.
- **HTTPS**: the edge terminates TLS and forwards plain HTTP, setting `X-Forwarded-Proto: https`
  (trust that header, never `SECURE_SSL_REDIRECT` at the app level).
- **Logs**: put the level at the start of each line (e.g. `[INFO] ...`) so JetDeploy's log level
  filter recognizes it.
- **Shutdown**: every deploy, restart and stop sends `SIGTERM` to the process and kills it after
  the grace period — PID 1 has to handle `SIGTERM` and exit promptly, which usually means running
  the real process directly (exec form `CMD`), not behind a shell wrapper.

## Reference

- [https://jetdeploy.com/llms.txt](https://jetdeploy.com/llms.txt) — the full agent-facing guide:
  API, MCP, authentication, errors, operations, log streaming, the complete deploy flow.
- [https://jetdeploy.com/api/v1/docs](https://jetdeploy.com/api/v1/docs) — interactive API
  reference (same schema as `/api/v1/openapi.json`).
