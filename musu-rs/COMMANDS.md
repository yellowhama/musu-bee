# MUSU Command Reference

> AI agents: read this file to understand all musu capabilities.
> Users speak natural language → you translate to these commands.

## Quick Start (3 steps)

```bash
# 1. Install on every machine
curl -fsSL https://musu.pro/install.sh | bash    # Linux/Mac
irm https://musu.pro/install.ps1 | iex            # Windows

# 2. Login on every machine
musu login

# 3. Start bridge on every machine
musu bridge
```

Done. Machines logged into the same account will automatically discover and connect to each other. You can now route tasks, share files, and sync between machines.

---

## Task Routing — "일 시키기"

Send work to any connected machine. AI agents should use these when the user wants to run something on another computer.

### Route a task (to specific machine)
```bash
musu route "build and test this project" --target pc-b
```

### Route with wait (get result back)
```bash
musu route "cargo test" --target pc-b --wait
```

### Route to GPU node (auto-routing)
```bash
musu route "train the model" --gpu
```

### Route a task (auto — sends to local)
```bash
musu route "run the test suite"
```

### What user might say → What to run
| User says | Command |
|-----------|---------|
| "PC B에서 빌드해" | `musu route "cargo build" --target pc-b` |
| "다른 컴퓨터에서 테스트 돌려" | `musu route "cargo test" --target pc-b --wait` |
| "GPU 서버에서 학습해" | `musu route "python train.py" --gpu` |
| "이거 실행해봐" | `musu route "python main.py"` |

---

## File Sharing — "파일 공유"

Share directories with connected machines. Like Google Drive but between your own PCs.

### Share a folder
```bash
musu share F:\workspace                    # read-only
musu share F:\workspace --writable         # read + write
musu share D:\data --label "datasets"      # with label
```

### Stop sharing
```bash
musu unshare F:\workspace
```

### List what's shared
```bash
musu shares
```

### Real-time sync (auto-push changes to peers)
```bash
musu sync
```

### Mount remote files as a drive (WebDAV)
```bash
musu mount                         # show local WebDAV URL
musu mount --node pc-b             # mount instructions for pc-b
# Then: net use Z: http://pc-b:8070/webdav   (Windows)
```

### What user might say → What to run
| User says | Command |
|-----------|---------|
| "이 폴더 공유해" | `musu share <current_dir>` |
| "워크스페이스 공유 설정해" | `musu share F:\workspace --writable` |
| "뭐 공유하고 있어?" | `musu shares` |
| "공유 풀어" | `musu unshare F:\workspace` |
| "파일 자동 동기화해" | `musu sync` |
| "드라이브처럼 마운트해" | `musu mount --node pc-b` |

---

## Remote File Operations — "다른 컴퓨터 파일"

Browse, download, upload files on connected machines.

### List files on a peer
```bash
musu ls pc-b:F:\workspace
musu ls pc-b:D:\data
```

### Download a file from a peer
```bash
musu get pc-b:F:\workspace\results.csv
musu get pc-b:F:\workspace\report.pdf --output ./report.pdf
```

### Upload a file to a peer
```bash
musu put ./local-file.txt pc-b:F:\workspace\remote-file.txt
```

### What user might say → What to run
| User says | Command |
|-----------|---------|
| "PC B에 뭐 있어?" | `musu ls pc-b:F:\` |
| "저 컴퓨터에서 파일 가져와" | `musu get pc-b:/path/to/file` |
| "이 파일 PC B로 보내" | `musu put ./file pc-b:/path/to/dest` |

---

## Peer Management — "기기 연결"

### Auto-discover peers on LAN (mDNS)
```bash
musu discover                    # scan for 5 seconds
musu discover --timeout 10       # scan for 10 seconds
```

### Pair machines with a code (easy mode)
```bash
# On PC A:
musu pair                        # → prints code like 123-456

# On PC B:
musu join 123-456                # → pairs with PC A
```

### Manual peer add
```bash
musu peer add --addr 192.168.1.50:8070 --name pc-b
```

### List peers
```bash
musu peer list
```

### Remove a peer
```bash
musu peer remove --name pc-b
```

### What user might say → What to run
| User says | Command |
|-----------|---------|
| "다른 컴퓨터 찾아봐" | `musu discover` |
| "이 컴퓨터 페어링해" | `musu pair` → then `musu join <code>` |
| "PC B 연결해" | `musu peer add --addr <ip>:8070 --name pc-b` |
| "연결된 기기 뭐 있어?" | `musu peer list` |
| "PC B 연결 끊어" | `musu peer remove --name pc-b` |

---

## Fleet Status — "전체 현황"

### See fleet overview
```bash
musu status                      # all nodes + task counts
```

### See recent tasks
```bash
musu tasks                       # last 100 tasks with status
```

### What user might say → What to run
| User says | Command |
|-----------|---------|
| "전체 상태 보여줘" | `musu status` |
| "작업 목록 보여줘" | `musu tasks` |
| "뭐 돌아가고 있어?" | `musu status` |

---

## Bridge Server — "서버 시작"

### Start bridge
```bash
musu bridge                              # default :8070
musu bridge --port 9090                  # custom port
BRIDGE_HOST=0.0.0.0 musu bridge         # listen on all interfaces (LAN)
MUSU_TLS=1 musu bridge                  # TLS encrypted
```

### Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `BRIDGE_PORT` | 8070 | Bridge listen port |
| `BRIDGE_HOST` | 127.0.0.1 | Bind address |
| `MUSU_BRIDGE_TOKEN` | (required in prod) | Auth token (≥32 chars) |
| `MUSU_ENV` | production | Set to `development` for dev mode |
| `MUSU_NODE_NAME` | hostname | This machine's name |
| `MUSU_FILE_SERVE_ROOTS` | (empty) | Comma-separated dirs to expose |
| `MUSU_FILE_SERVE_WRITABLE` | false | Allow file writes via API |
| `MUSU_ALLOW_PLAINTEXT_LAN` | false | Suppress non-loopback warning |
| `MUSU_TLS` | false | Enable TLS (auto-generates certs) |
| `MUSU_TLS_CERT` | (auto) | Custom TLS cert path |
| `MUSU_TLS_KEY` | (auto) | Custom TLS key path |
| `MUSU_GPU_PRESENT` | false | Advertise GPU capability |
| `MUSU_GPU_VRAM_GB` | (none) | GPU VRAM in GB |

---

## Installation & Updates

### Install
```bash
curl -fsSL https://musu.pro/install.sh | bash    # Linux/Mac
irm https://musu.pro/install.ps1 | iex            # Windows
```

### Update
```bash
musu auto-update
```

### Uninstall
```bash
musu uninstall
```

### System service (auto-start on boot)
```bash
musu supervise
```

---

## Workflow DAG — "워크플로우"

### Generate a workflow from natural language
```bash
curl -X POST http://localhost:8070/api/workflows/generate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt": "build, test, then deploy to staging"}'
```

### Create workflow (with attestation)
```bash
curl -X POST http://localhost:8070/api/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"company_id":"...","name":"deploy","spec":...,"attestation_token":"attest-..."}'
```

### Execute a workflow
```bash
musu workflow-run <workflow-id>
```

---

## HTTP API Reference (for programmatic use)

All endpoints require `Authorization: Bearer <token>` header.

### Tasks
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/tasks/delegate | Delegate a task (with optional target_node, needs_gpu) |
| POST | /api/tasks/forward | Receive forwarded task from peer |
| POST | /api/tasks/callback | Receive result callback from peer (F1) |
| GET | /api/tasks/:id | Get task status and result |
| GET | /api/tasks | List recent tasks (F3) |
| GET | /api/tasks/events | SSE event stream for task status |
| DELETE | /api/tasks/:id | Cancel a running task |

### Fleet
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/fleet/status | Full fleet overview (F3) |
| GET | /api/fleet/node-status | This node's status (F3) |

### Pairing
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/pair/offer | Generate pairing code (F7) |
| POST | /api/pair/accept | Accept pairing code (F7) |

### Files
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/files?path=... | List directory contents |
| GET | /api/files/read?path=... | Download file (streaming) |
| POST | /api/files/write?path=... | Upload/create file |
| POST | /api/files/mkdir?path=... | Create directory |
| DELETE | /api/files?path=... | Delete file/directory |
| GET | /api/files/info?path=... | File metadata |

### WebDAV
| Method | Path | Purpose |
|--------|------|---------|
| ANY | /webdav/* | WebDAV mount endpoint (F10) |

### Nodes
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/nodes | List peers with health status |
| POST | /api/nodes/add | Register a peer |
| POST | /api/nodes/accept-peer | Accept peer registration |

### Companies (workspaces)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/companies | List workspaces |
| POST | /api/companies | Create workspace |
| GET | /api/companies/:id | Get workspace |
| POST | /api/companies/:id/activate | Activate workspace |
| POST | /api/companies/:id/run | Run task in workspace |

### Workflows
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/workflows/generate | Generate DAG from prompt |
| POST | /api/workflows | Create workflow (needs attestation) |
| GET | /api/workflows | List workflows |
| GET | /api/workflows/:id | Get workflow detail |
| GET | /api/workflows/:id/status | Get workflow + step statuses |
| PATCH | /api/workflows/:id | Update workflow status |
| DELETE | /api/workflows/:id | Delete workflow |
| POST | /api/workflows/:id/retry | Retry failed steps |
| POST | /api/workflows/:id/execute | Start execution (F5) |

### Search
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/index-search?q=...&workspace=... | Full-text search |

### System
| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| POST | /api/system/update | Trigger auto-update |

### MCP (for AI tools like Claude Code)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /mcp/v1/messages | JSON-RPC 2.0 MCP endpoint |
| GET | /mcp/v1/health | MCP health check |

---

## Configuration Files

All stored in `~/.musu/`:

| File | Purpose |
|------|---------|
| `nodes.toml` | Registered peers |
| `manual_peers.toml` | Manually added peers |
| `nodes.cache.json` | Cached peer discovery |
| `shares.toml` | Shared directories |
| `tls/cert.pem` | TLS certificate (auto-generated) |
| `tls/key.pem` | TLS private key (auto-generated) |
| `db/musu.db` | Main database |
| `data/audit.db` | Audit log |

---

## Common Scenarios

### "Set up 2 PCs"
```bash
# On BOTH machines:
curl -fsSL https://musu.pro/install.sh | bash
musu login
musu bridge &

# Done! Now from either machine:
musu status                  # see both machines
musu route "run tests" --target pc-b --wait
musu ls pc-b:/workspace
```

### "Share files like Google Drive"
```bash
musu share F:\workspace --writable     # expose folder
musu sync                               # auto-sync changes
# Or mount as drive:
musu mount --node pc-b                  # shows mount command
net use Z: http://pc-b:8070/webdav      # Windows
```

### "Build on GPU machine, test on CI machine"
```bash
musu route "cargo build --release" --gpu
musu route "cargo test" --target ci-runner --wait
```

### "Run a multi-step workflow"
```bash
musu workflow-run <workflow-id>          # execute DAG steps
musu tasks                               # check progress
```
