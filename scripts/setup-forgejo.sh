#!/usr/bin/env bash
set -e

FORGEJO_DIR="$HOME/.musu/forgejo"
BIN="$HOME/.musu/bin/forgejo"
CONF="$FORGEJO_DIR/custom/conf/app.ini"

mkdir -p "$FORGEJO_DIR/custom/conf"
mkdir -p "$FORGEJO_DIR/data"
mkdir -p "$FORGEJO_DIR/log"
mkdir -p "$FORGEJO_DIR/repos"

echo "APP_NAME = MUSU Local Git
RUN_MODE = prod

[repository]
ROOT = $FORGEJO_DIR/repos

[server]
PROTOCOL = http
DOMAIN = 127.0.0.1
ROOT_URL = http://127.0.0.1:3000/
HTTP_ADDR = 127.0.0.1
HTTP_PORT = 3000
DISABLE_SSH = false
START_SSH_SERVER = true
SSH_PORT = 2222

[database]
DB_TYPE = sqlite3
PATH = $FORGEJO_DIR/data/gitea.db

[security]
INSTALL_LOCK = true
SECRET_KEY = 1234567890123456

[log]
MODE = console
LEVEL = info" > "$CONF"

# Start forgejo in background
export GITEA_WORK_DIR="$FORGEJO_DIR"
"$BIN" web -c "$CONF" > "$FORGEJO_DIR/log/forgejo.log" 2>&1 &
PID=$!
sleep 5

echo "Creating admin user..."
"$BIN" admin user create --admin --username musu_admin --password musu_admin --email musu@example.com -c "$CONF" || true

KEY_FILE="$HOME/.ssh/id_rsa_musu_agent"
if [ ! -f "$KEY_FILE" ]; then
    echo "Generating new SSH key..."
    ssh-keygen -t ed25519 -f "$KEY_FILE" -N "" -q
fi

echo "Adding SSH key to admin user..."
"$BIN" admin user add-keys --username musu_admin --key-file "$KEY_FILE.pub" -c "$CONF" || true

kill "$PID" || true
echo "Setup complete. Forgejo binary is at $BIN and data is at $FORGEJO_DIR"
