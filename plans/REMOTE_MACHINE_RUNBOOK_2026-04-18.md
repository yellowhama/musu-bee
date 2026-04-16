# Remote Machine Connection Runbook

> Target: `100.121.211.106` (Tailscale — `hugh-main-1`)
> Created: 2026-04-18
> Status: unreachable as of 2026-04-18

---

## Symptom

```
curl http://100.121.211.106:1355/health
# → curl: (7) Failed to connect — Connection refused / No route to host
```

---

## Step 1: Open firewall ports (iptables)

SSH into the remote machine (via console or another route), then:

```bash
# Allow musu-bridge (8070) and musu-port (1355) inbound on Tailscale interface
sudo iptables -I INPUT -i tailscale0 -p tcp --dport 8070 -j ACCEPT
sudo iptables -I INPUT -i tailscale0 -p tcp --dport 1355 -j ACCEPT

# Make persistent (Debian/Ubuntu)
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Step 2: Verify musu-bridge + musu-port bind on 0.0.0.0

musu-bridge default changed to `127.0.0.1` in P4 (config.py).
For remote access via Tailscale, the remote machine must explicitly set:

```bash
# In ~/.musu/.env or systemd unit
BRIDGE_HOST=0.0.0.0
```

For musu-port, check the running config:

```bash
# On remote machine
systemctl status musu-port
# or
ps aux | grep musu-port
```

If it's binding `127.0.0.1:1355`, restart with `MUSU_PORT_HOST=0.0.0.0`.

---

## Step 3: git pull + restart services

```bash
cd /home/hugh51/musu-functions   # adjust path on remote
git pull origin main

# Restart musu-bridge
systemctl restart musu-bridge
# or: pkill -f musu-bridge && bash scripts/start-bridge.sh &

# Restart musu-port
systemctl restart musu-port
# or: pkill -f musu-port && ./musu-port/target/release/musu-port &
```

---

## Step 4: Health check

From local machine:

```bash
# musu-bridge
curl -s http://100.121.211.106:8070/health
# Expected: {"status":"ok",...}

# musu-port
curl -s http://100.121.211.106:1355/health
# Expected: {"status":"ok",...}
```

---

## Step 5: Re-register with musu.pro

After bridge restart, it will auto-register via `POST /api/v1/nodes/register`.
This populates the `bridge_token` column (required for WoL to work).

Verify:
```bash
curl -s -X POST https://api.supabase.com/v1/projects/poyclapxmvulvboiebxq/database/query \
  -H "Authorization: Bearer sbp_17e09dee519f531792828842177d4cd43ca92507" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT node_name, bridge_token IS NOT NULL as has_token, last_seen FROM nodes ORDER BY last_seen DESC LIMIT 5;"}'
```

Expected: `has_token = true` for `hugh-main-1`.
