# Evidence — Idle Budget & Heavy-Work Blacklist (MUS-1227)

Date: 2026-04-09
Owner: Founding Engineer

## 1. Baseline Measurement (Current State)

| Process | CPU (%) | RAM (RSS) | Port | Note |
| :--- | :--- | :--- | :--- | :--- |
| `llama-server` | 0.1 | 109 MB | 18081 | Heavy-work process (LLM) |
| `postgres` | 0.0 | ~10 MB | 54329 | DB infra |
| `gemini` (CTO) | 1.0-5.0 | ~150 MB | N/A | Active agent |
| `musu-port` | N/A | N/A | 1355 | Not currently running |
| `musu-worker`| N/A | N/A | 9700 | Not currently running |

*Note: Baseline measured during idle state with active agents running.*

## 2. Defined Acceptance Budget (Target)

| Metric | Goal (Idle) | Target (Normal) | Max (Stress) |
| :--- | :--- | :--- | :--- |
| CPU (Total Core) | < 1.0% | < 5.0% | < 10.0% |
| RAM (RSS Total) | < 250 MB | < 600 MB | < 1.2 GB |
| GPU Utilization | 0% | < 5% | < 15% (UI) |
| Disk Write | < 1 MB/min | < 10 MB/min | < 100 MB/min |
| Net (I/O) | < 10 KB/s | < 100 KB/s | < 2 MB/s |

*Total Core = `musu-bee` (server side) + `musu-bridge` + `musu-port`.*

## 3. Heavy-Work Blacklist (Forbidden in Core/Port/Bridge)

The following operations MUST NOT be performed by the control plane processes. They MUST be delegated to `musu-worker` or an independent service.

1.  **Local LLM Inference:** Direct model loading (GGML/GGUF/Safetensors) or calling local inference engines (llama.cpp, Ollama) within the process.
2.  **Long-blocking Sync APIs:** Synchronous calls to external AI APIs (Anthropic, OpenAI) exceeding 5s. Must use async tasks or worker delegation.
3.  **Recursive Tree Walking:** Real-time indexing of the entire file system (e.g., recursive `ls` or `find` on `/`). Use `musu-scanner` or background indexing.
4.  **Heavy Transformation:** Video/Image transcoding (FFmpeg), large PDF parsing, or heavy regex over files > 50MB.
5.  **GPU Compute:** Direct CUDA/Vulkan/Metal kernel execution.
6.  **Unbounded Memory Loads:** Loading large datasets (> 100MB) into memory for processing.

## 4. Verification Commands

To verify if the system stays within budget:

```bash
# 1. Check process resource usage
ps -eo pid,pcpu,pmem,rss,cmd | grep -E 'musu|worker|bridge' | grep -v grep

# 2. Check GPU usage
nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader || echo "No GPU"

# 3. Check for blacklist violations (example: direct LLM calls)
rg -E "llama_cpp|openai|anthropic" musu-port/ musu-bridge/
```

## 5. Next Steps for Implementation

- Move `musu-port`'s direct Anthropic call to an async worker task.
- Enforce `musu-scanner` priority via `ionice` and `nice`.
- Implement `cgroup` limits in systemd service files for `musu-worker`.
