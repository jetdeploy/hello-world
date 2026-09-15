# Next.js example

A Next.js App Router app, built standalone and served with a plain `node` process. Copy this
directory as the root of your own repository (see the root [README](../README.md)) and build on
it.

## Contents

- `Dockerfile` — three stages on `node:24.21.0-alpine`: install dependencies, build with
  `next build`, then a minimal runtime image running the standalone server as a non-root user.
- `next.config.mjs` — sets `output: "standalone"`.
- `app/` — the App Router pages.
- `public/` — static files served at `/`.
- `package-lock.json` — committed, generated inside a `node:24.21.0-alpine` container to match
  the Dockerfile's Node version.

## Dockerfile choices that matter on JetDeploy

- **Standalone output**: `output: "standalone"` makes `next build` emit a self-contained
  `.next/standalone/server.js` with only the dependencies it actually needs traced in, instead of
  requiring the full `node_modules` (and a `next start`) in the final image.
- **Port**: `ENV PORT=8080` and `ENV HOSTNAME=0.0.0.0` are baked into the final image, so the
  standalone server listens on `0.0.0.0:8080` without any runtime env being set. JetDeploy sets no
  `PORT` variable, so this can't be left to a default of `3000`.
- **SIGTERM**: `CMD ["node", "server.js"]` (exec form, no shell) makes the Node process PID 1.
  This was verified directly: `next build`'s standalone server shuts down on `SIGTERM` in well
  under a second, so no init wrapper (e.g. `tini`) is needed here — confirmed with
  `docker stop -t 30` returning in well under 30 seconds.
- **Telemetry**: `NEXT_TELEMETRY_DISABLED=1` is set at both build time (so `next build` doesn't
  phone home) and run time.
- **Non-root**: the runtime stage creates a `nextjs` user and copies the standalone output,
  static assets and `public/` with `--chown=nextjs:nodejs`.
- **Multi-stage build**: only `public/`, `.next/standalone` and `.next/static` are copied into the
  final image — no source, no dev dependencies, no full `node_modules`.

## Envs

None required.

## Pod settings

`{"name": "web", "port": 8080, "external": true}`.

## Pre-deploy script

None.

## Deploy steps

Copy this directory to the root of a new repository first:

```
cp -r nextjs my-app && cd my-app && git init -b main && git add -A && git commit -m "Initial commit"
```

### As MCP tool calls

1. `create_app` — `{"name": "my-app", "branch": "main"}`
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
  -d '{"name": "my-app", "branch": "main"}')
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
