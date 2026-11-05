# nginx example

A static site served by nginx. Copy this directory as the root of your own repository (see the
root [README](../README.md)), replace `index.html` and add whatever else nginx should serve, and
deploy it as-is.

## Contents

- `Dockerfile` — pinned `nginx:1.30.4-alpine-slim`, runs as the non-root `nginx` user.
- `default.conf` — nginx server block, listens on `8080`.
- `index.html` — the page served at `/`.

## Dockerfile choices that matter on JetDeploy

- **Port**: `default.conf` listens on `8080`, the port every JetDeploy pod's process must bind to
  on `0.0.0.0`. JetDeploy sets no `PORT` variable, so the port is hardcoded in the config, not read
  from the environment.
- **SIGTERM**: the image's entrypoint runs `nginx -g "daemon off;"` as PID 1, and nginx's master
  process shuts down promptly on `SIGTERM`. Every deploy, restart and stop sends `SIGTERM` and
  kills the process after the grace period, so this must stay PID 1 — no wrapper shell script in
  front of it.
- **Non-root**: the Dockerfile moves the pid file to `/tmp` and hands `/var/cache/nginx` and
  `/etc/nginx/conf.d` to the `nginx` user (uid 101) so the master process can run as `USER nginx`
  without needing to bind a privileged port (`8080` already isn't one).
- **Logs**: the base image already symlinks nginx's access and error logs to `/dev/stdout` and
  `/dev/stderr`, so `GET /api/v1/apps/{app_id}/logs/tail` sees them. nginx has no per-line
  level, so JetDeploy's level filter treats these lines as unclassified; that's expected for a
  pure static site.

## Envs

None required.

## Pod settings

`{"name": "web", "port": 8080, "external": true}`.

## Pre-deploy script

None.

## Deploy steps

Copy this directory to the root of a new repository first:

```
cp -r nginx my-site && cd my-site && git init -b main && git add -A && git commit -m "Initial commit"
```

### As MCP tool calls

1. `create_app` — `{"name": "my-site", "branch": "main"}`
2. `create_pod` — `{"app_id": <id>, "name": "web", "port": 8080, "external": true}`
3. `get_profile` — read `git_token.secret` (or use `git_remote_with_token` from step 1's answer)
4. Push with git (see below)
5. `get_operation` on the id from the push output, poll until `is_finished` and `status` is
   `SUCCESS`
6. Open the app's `url`

### As curl API calls

```sh
API=https://jetdeploy.com/api/v1
TOKEN=<your API token>

APP=$(curl -s -X POST $API/apps \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "my-site", "branch": "main"}')
APP_ID=$(echo "$APP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
GIT_REMOTE=$(echo "$APP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["git_remote_url"])')

curl -s -X POST $API/apps/$APP_ID/pods \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name": "web", "port": 8080, "external": true}'

GIT_TOKEN=$(curl -s $API/profile -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["git_token"]["secret"])')

JD_GIT_TOKEN=$GIT_TOKEN git -c credential.helper= \
  -c credential.helper='!f() { echo username=git; echo "password=$JD_GIT_TOKEN"; }; f' \
  push $GIT_REMOTE HEAD:refs/heads/main
```

The push output names the operation, e.g. `App deploy in progress: operation 123`. Poll it:

```sh
curl -s $API/operations/123 -H "Authorization: Bearer $TOKEN"
```

Once `is_finished` is `true` and `status` is `SUCCESS`, the app answers at its `url`.
