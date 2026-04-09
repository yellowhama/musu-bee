# Connect Architecture

## Purpose

Define MUSU Connect as a product layer separate from the free local core.

MUSU Connect is the paid remote operating surface that allows users to reach their MUSU system from outside their own network.

## Architectural principle

Free MUSU Core:
- local runtime
- LAN access
- local orchestration

Paid MUSU Connect:
- internet-facing access layer
- remote identity / auth
- secure relay / tunnel
- remote session continuity

## Required capabilities

Connect must provide:
- authenticated remote entry point
- device identity and binding
- secure relay or tunnel
- remote web GUI session access
- audit log for external access
- session resume and device status lookup

## Separation rule

Connect must remain a layer on top of Core, not a rewrite of Core.

That means:
- Core must still work fully on localhost/LAN without Connect.
- Connect should wrap Core access, not replace Core internals.
- Pricing and hosting concerns should stay outside the local runtime.

## Control flow

Typical remote flow:
1. user authenticates to MUSU Connect
2. Connect resolves workspace and allowed devices
3. Connect establishes secure relay / tunnel
4. Connect proxies control-plane access to the target MUSU Core surface
5. actions and sessions are audited

## UX rule

Remote GUI exists to support:
- observe
- instruct
- resume
- handle exceptions

It is not the definition of the product core.

## Open design questions

- relay vs direct tunnel fallback strategy
- device wake / session restore behavior
- mobile access scope
- pack installation from remote GUI
- audit retention and enterprise controls

