# 2026-06-02 14:28 KST - Release Gate Script Index Refresh

After release gate status script hardening and docs updates, the code/doc index
was refreshed through the explicit WindowsApps alias:

```powershell
musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee
```

Result:

- indexed 1348 files
- indexed 2239 symbols

Search terms:

- `GOAL v304`
- `GOAL v305`
- `wiki/552`
- `-ScriptTimeoutSeconds`
- `.NET ProcessStartInfo`
- `.NET SHA256`
- `Script timed out after 1s`
- `packet_verified true`
- `action_pack_verified true`
