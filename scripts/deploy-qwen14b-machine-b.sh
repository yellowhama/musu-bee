#!/usr/bin/env bash
# deploy-qwen14b-machine-b.sh
# Deploy Qwen 14B Q4 on Machine B (5070Ti) via llama.cpp server on :18082
# Run this script on Machine B (100.121.211.106) directly.
#
# Prerequisites:
#   - CUDA 12+ drivers installed
#   - cmake, git, build-essential available
#   - ~10GB free disk space for model weights
#
# Usage:
#   ssh user@100.121.211.106 'bash -s' < deploy-qwen14b-machine-b.sh

set -euo pipefail

MODEL_DIR="${MODEL_DIR:-/opt/models/qwen14b}"
LLAMACPP_DIR="${LLAMACPP_DIR:-/opt/llama.cpp}"
PORT=18082
SERVICE_NAME=llama-qwen14b

echo "=== Step 1: Build llama.cpp with CUDA support ==="
if [[ ! -x "$LLAMACPP_DIR/llama-server" ]]; then
  git clone --depth 1 https://github.com/ggml-org/llama.cpp "$LLAMACPP_DIR" || true
  cd "$LLAMACPP_DIR"
  cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
  cmake --build build --config Release -j"$(nproc)"
  cp build/bin/llama-server .
else
  echo "llama.cpp already built, skipping."
fi

echo "=== Step 2: Download Qwen2.5-14B-Instruct Q4_K_M model ==="
mkdir -p "$MODEL_DIR"
MODEL_FILE="$MODEL_DIR/qwen2.5-14b-instruct-q4_k_m.gguf"
if [[ ! -f "$MODEL_FILE" ]]; then
  # Hugging Face mirror — adjust URL for your network environment
  HF_URL="https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF/resolve/main/qwen2.5-14b-instruct-q4_k_m.gguf"
  echo "Downloading from $HF_URL ..."
  wget -q --show-progress -O "$MODEL_FILE" "$HF_URL"
else
  echo "Model already present at $MODEL_FILE"
fi

echo "=== Step 3: Write systemd service ==="
{
  printf '%s\n' '[Unit]'
  printf '%s\n' 'Description=llama.cpp Qwen 14B inference server (Machine B 5070Ti)'
  printf '%s\n' 'After=network.target'
  printf '\n'
  printf '%s\n' '[Service]'
  printf '%s\n' 'Type=simple'
  printf '%s\n' "ExecStart=${LLAMACPP_DIR}/llama-server \\"
  printf '%s\n' "  --model ${MODEL_FILE} \\"
  printf '%s\n' "  --port ${PORT} \\"
  printf '%s\n' '  --host 0.0.0.0 \'
  printf '%s\n' '  --n-gpu-layers 40 \'
  printf '%s\n' '  --ctx-size 8192 \'
  printf '%s\n' '  --threads 8 \'
  printf '%s\n' '  --parallel 4'
  printf '%s\n' 'Restart=on-failure'
  printf '%s\n' 'RestartSec=5'
  printf '%s\n' 'StandardOutput=journal'
  printf '%s\n' 'StandardError=journal'
  printf '\n'
  printf '%s\n' '[Install]'
  printf '%s\n' 'WantedBy=multi-user.target'
} >"/etc/systemd/system/${SERVICE_NAME}.service"

echo "=== Step 4: Enable and start service ==="
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
systemctl --no-pager status "$SERVICE_NAME"

echo ""
echo "=== Verification ==="
sleep 3
curl -s http://localhost:${PORT}/v1/models | python3 -m json.tool || true
echo ""
echo "Qwen 14B deployed on port ${PORT}. Done."
