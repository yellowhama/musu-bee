# MUSU 1.15.0-rc.1 CEO Dispatch SSE Cleanup Hardening

Date: 2026-06-04 13:57 KST

## Change

The CEO dispatch chat run stream now explicitly tracks and closes active
`EventSource` instances.

Before this pass, `CeoChatClient` opened an `EventSource` for each dispatch run
and closed it on terminal stream messages or `onerror`, but it did not keep an
active stream registry. That left the unmount/lifecycle cleanup contract too
weak for release idle-loop evidence.

Now:

- active run streams are stored in `runStreamsRef: Map<string, EventSource>`
- starting a stream closes any previous stream for the same run id
- terminal messages remove the stream from the map and close it
- SSE errors close the stream, remove it from the map, and mark a still
  streaming run as `error`
- component unmount closes every active run stream and clears the map

## Gate coverage

The frontend polling contract now explicitly checks:

- the shared bounded EventSource hook's retry caps and visibility reconnect
  cadence,
- CEO dispatch stream tracking,
- CEO dispatch stream registration/removal,
- CEO dispatch unmount cleanup,
- CEO dispatch error cleanup, and
- no direct interval polling in the CEO dispatch chat surface.

The runtime polling contract test now includes:

- `CEO dispatch run streams are explicitly closed`

## Validation

- `npm run test:runtime-polling`: `15/15`
- `audit-frontend-polling-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`, `direct_interval_hit_count=0`,
  `direct_visibility_listener_hit_count=0`
- `npm run typecheck`: passed
- `npm run build`: passed

## Release meaning

This closes another frontend SSE/background-loop cleanup candidate. Because
frontend runtime source changed, current packaged single-machine smoke, idle CPU,
and runtime CPU matrix evidence must be refreshed after commit before this HEAD
can reclaim current-source release gates.
