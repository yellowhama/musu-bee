# Wave F Deployment Runbook — 3-Machine musu-connects Chain

**Related issues:** MUS-437 (hardware gate), MUS-432 (3-machine chain proof), MUS-646 (prep scaffold)

This runbook covers deploying `musu-connectsd` on the two GPU nodes and running the
3-machine acceptance test once physical hardware is provisioned.

---

## 1. Topology

| Role             | Node Key         | Hostname              | GPU          |
|------------------|------------------|-----------------------|--------------|
| Operator/Control | `operator_laptop`| `operator-laptop`     | (none)       |
| Primary GPU      | `gpu_primary`    | `gpu-primary-5070ti`  | RTX 5070 Ti  |
| Secondary GPU    | `gpu_secondary`  | `gpu-secondary-4060ti`| RTX 4060 Ti  |

---

## 2. Pre-flight Network Reachability Checklist

Before deploying, verify bidirectional connectivity between all three nodes.

```bash
# From operator_laptop
ping -c 3 gpu-primary-5070ti
ping -c 3 gpu-secondary-4060ti

# From gpu_primary
ping -c 3 operator-laptop
ping -c 3 gpu-secondary-4060ti

# From gpu_secondary
ping -c 3 operator-laptop
ping -c 3 gpu-primary-5070ti
```

All pings must succeed. If DNS resolution fails, use IP addresses and add entries to
`/etc/hosts` on each machine.

---

## 3. Required Ports and Firewall Rules

`musu-connectsd` uses QUIC (UDP) for inter-node transport.

| Port  | Protocol | Direction               | Purpose                    |
|-------|----------|-------------------------|----------------------------|
| 7700  | UDP      | operator → gpu_primary  | QUIC control channel       |
| 7700  | UDP      | gpu_primary → gpu_secondary | QUIC relay             |
| 7701  | TCP      | all                     | musu-connectsd status/API  |

On each node (Ubuntu/Debian):
```bash
sudo ufw allow 7700/udp
sudo ufw allow 7701/tcp
sudo ufw reload
```

On Windows (if WSL2 is involved):
```powershell
New-NetFirewallRule -DisplayName "musu-connects QUIC" -Direction Inbound -Protocol UDP -LocalPort 7700 -Action Allow
New-NetFirewallRule -DisplayName "musu-connects API"  -Direction Inbound -Protocol TCP -LocalPort 7701 -Action Allow
```

---

## 4. Installing musu-connectsd on gpu_primary (5070 Ti)

```bash
# 1. Copy the musu-connects package from operator_laptop
scp -r /path/to/musu-functions/musu-connects user@gpu-primary-5070ti:~/musu-connects

# 2. SSH into gpu_primary
ssh user@gpu-primary-5070ti

# 3. Install dependencies
cd ~/musu-connects
npm install   # or: bun install

# 4. Set required environment variables
cat >> ~/.bashrc << 'EOF'
export MUSU_HOST_IDENTIFIER=gpu-primary-5070ti
export MUSU_PROFILE=home-gpu-primary-5070ti
export MUSU_CONNECTS_PORT=7700
export MUSU_CONNECTS_API_PORT=7701
export MUSU_CONNECTS_UPSTREAM=         # leave empty — gpu_primary is first relay
export MUSU_CONNECTS_DOWNSTREAM=gpu-secondary-4060ti:7700
EOF
source ~/.bashrc

# 5. Start daemon
node musu-connectsd.mjs &
# Or via systemd (see Section 6)

# 6. Verify
curl http://localhost:7701/status
# Expected: {"status":"ok","host_identifier":"gpu-primary-5070ti","profile":"home-gpu-primary-5070ti"}
```

---

## 5. Installing musu-connectsd on gpu_secondary (4060 Ti)

```bash
# 1. Copy from operator_laptop
scp -r /path/to/musu-functions/musu-connects user@gpu-secondary-4060ti:~/musu-connects

# 2. SSH into gpu_secondary
ssh user@gpu-secondary-4060ti

# 3. Install dependencies
cd ~/musu-connects
npm install

# 4. Set required environment variables
cat >> ~/.bashrc << 'EOF'
export MUSU_HOST_IDENTIFIER=gpu-secondary-4060ti
export MUSU_PROFILE=home-gpu-secondary-4060ti
export MUSU_CONNECTS_PORT=7700
export MUSU_CONNECTS_API_PORT=7701
export MUSU_CONNECTS_UPSTREAM=gpu-primary-5070ti:7700
export MUSU_CONNECTS_DOWNSTREAM=   # gpu_secondary is the last hop
EOF
source ~/.bashrc

# 5. Start daemon
node musu-connectsd.mjs &

# 6. Verify
curl http://localhost:7701/status
# Expected: {"status":"ok","host_identifier":"gpu-secondary-4060ti","profile":"home-gpu-secondary-4060ti"}
```

---

## 6. systemd Unit (Optional, for Persistent Daemon)

Create `/etc/systemd/system/musu-connectsd.service` on each GPU node:

```ini
[Unit]
Description=musu-connects daemon
After=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/musu-connects
ExecStart=/usr/bin/node musu-connectsd.mjs
Restart=on-failure
EnvironmentFile=/home/YOUR_USER/.musu-env

[Install]
WantedBy=multi-user.target
```

Put env vars in `/home/YOUR_USER/.musu-env` (no `export` prefix, one per line).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now musu-connectsd
sudo systemctl status musu-connectsd
```

---

## 7. Running the 3-Machine Acceptance Test

Once all three nodes are up and connected:

```bash
# From operator_laptop (the musu-functions workspace)
mkdir -p /tmp/mus432-proof

node scripts/3machine-chain-harness.mjs \
  --out /tmp/mus432-proof/chain-proof.json

# Inspect result
cat /tmp/mus432-proof/chain-proof.json | jq '{chainComplete, distinctHostIdentifiers, verdict}'
```

**Passing criteria:**
```json
{
  "chainComplete": true,
  "distinctHostIdentifiers": 3,
  "verdict": "PASS"
}
```

---

## 8. Dry-Run Validation (Hardware-Independent)

Before hardware is available, validate the schema and harness logic:

```bash
node scripts/3machine-chain-harness.mjs --dry-run --out /tmp/dry-run-proof.json
# Expect: verdict=DRY_RUN_SCHEMA_OK, chainComplete=true, distinctHostIdentifiers=3
```

Use the mock runner for a fuller local simulation:

```bash
node scripts/3machine-mock-runner.mjs
# Expect: chainComplete=true, distinctHostIdentifiers=3
```

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `distinctHostIdentifiers: 1` | All hops on same host | Verify env var `MUSU_HOST_IDENTIFIER` is set per-node |
| `chainComplete: false` | Fewer than 3 distinct hosts | Check network connectivity and daemon status on each node |
| Port unreachable | Firewall blocking UDP 7700 | Apply firewall rules from Section 3 |
| `hostname` returns wrong value | `/etc/hostname` not set | `hostnamectl set-hostname gpu-primary-5070ti` and reboot |
| QUIC handshake timeout | MTU mismatch or NAT blocking UDP | Try reducing MTU: `ip link set eth0 mtu 1400` |

---

## 10. What This Does NOT Satisfy

This runbook enables the Wave F acceptance test but does **not** by itself close
[MUS-437](../MUS-437) (Master Plan Condition 6). MUS-437 requires:

- Physical hardware provisioned and network-reachable
- Real QUIC transport across all 3 hops (not simulated)
- `chainComplete: true` with `distinctHostIdentifiers: 3` from a live run
- Evidence comment posted to MUS-437 with the proof JSON

Use this runbook as the operational guide to reach that state.
