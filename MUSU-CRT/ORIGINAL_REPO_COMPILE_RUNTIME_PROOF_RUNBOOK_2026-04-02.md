# Original Repo Compile Runtime Proof Runbook

작성일: 2026-04-02

## 목적

`MUSU-CRT` canonical 구현 이후, 원본 repo에서 compile/runtime proof를 수집하는 절차를 고정한다.

## 대상 repo

- reference / backport-later repo
  - [/mnt/f/Aisaak/Projects/Musu-new](/mnt/f/Aisaak/Projects/Musu-new)

## 확인 대상

### signaling thin slice

- `src-tauri/src/commands/webrtc.rs`
- `src-tauri/src/commands/webrtc_bridge.rs`
- `src/lib/tauri.ts`

### local stream split

- `src/hooks/useRealtimeStream.ts`
- `src/hooks/useRealtimeStreamSupport.ts`

## Windows 실행 순서

1. 작업 디렉터리 이동

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
```

2. 기존 프로세스 정리

```powershell
Get-Process musu-desktop,musu-engine,rustc,cargo -ErrorAction SilentlyContinue | Stop-Process -Force
```

3. build proof

```powershell
cargo build -p musu-desktop
```

4. test proof

```powershell
cargo test -p musu-desktop --lib --bins --tests
```

5. runtime smoke

```powershell
Start-Process .\target\debug\musu-desktop.exe
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8792/mcp/health"
```

## 수집할 증거

- `cargo build` 성공 로그
- `cargo test` 성공 로그
- `mcp/health` 응답
- CRT 관련 화면 또는 runtime entry가 깨지지 않는지 확인 결과

## 실패 시 우선 분기

### Rust compile failure

- `webrtc.rs`
- `webrtc_bridge.rs`
- `commands/mod.rs`

우선 확인

### frontend build/runtime failure

- `useRealtimeStream.ts`
- `useRealtimeStreamSupport.ts`

우선 확인

### unrelated existing failure

기존 repo 문제로 분리 기록 후 `MUSU-CRT` canonical 구현과 분리해서 적는다.
