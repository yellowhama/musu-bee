# musu-worker

Remote execution worker server for musu multi-machine setup. Runs FastAPI on port 9700.

## Security

> **Warning**: `/execute/process` is an **intentional RCE endpoint**. It runs
> any command passed by the caller with the privileges of the worker process.
> This is required for the musu multi-machine orchestration model.

**`MUSU_WORKER_TOKEN` must be set** before deploying musu-worker on any network
that is not fully trusted (i.e. anything beyond a private Tailscale mesh).
Without a token, every reachable caller can execute arbitrary commands on the
host. The server emits a loud `WARNING` log at startup when the token is absent.

### Environment variables

| Variable             | Required        | Description                                              |
|----------------------|-----------------|----------------------------------------------------------|
| `MUSU_WORKER_TOKEN`  | prod only       | Bearer token clients must send. Omit only on local dev / Tailscale-isolated nodes. |
| `MUSU_WORKER_HOST`   | no (0.0.0.0)    | Bind address.                                            |
| `MUSU_WORKER_PORT`   | no (9700)       | Listen port.                                             |
