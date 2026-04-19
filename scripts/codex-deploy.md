# musu-bridge 배포 (신규 기기)

You are a setup agent. Deploy musu-bridge on this machine by running the
commands below in order. Do not skip steps. Report results after each step.

---

## Step 1: Clone the repo

```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-functions
```

If the directory already exists, pull latest instead:

```bash
cd ~/musu-functions && git pull origin main
```

---

## Step 2: Run the bootstrap installer

```bash
bash ~/musu-functions/scripts/install.sh --start
```

This single command:
- Creates `~/.musu/` directory
- Creates Python venv and installs all dependencies
- Generates `~/.musu/bridge.env` with a secure token
- Initializes `~/.musu/nodes.toml`
- Starts the bridge and runs a health check

**If a `user_code` appears** (musu.pro device auth), report the code and
the verification URL shown — the user will approve from the dashboard.
The bridge will start regardless and register once approved.

---

## Step 3: Verify

```bash
curl http://127.0.0.1:8070/health
```

Expected response: `{"status":"ok"}`

---

## Report back

After the above, report:
1. Output of the health check (step 3)
2. Your machine's hostname: `hostname`
3. Whether a user_code was shown (and what it was)
4. Any errors encountered

---

## Troubleshooting

**Bridge won't start after install:**
```bash
tail -50 ~/musu-functions/logs/bridge-install-start.log
```

**Port 8070 already in use:**
```bash
lsof -i :8070
# Kill conflicting process, then retry install.sh --start
```

**python3 not found:**
```bash
sudo apt install -y python3 python3-venv python3-pip curl jq
# Then re-run install.sh --start
```
