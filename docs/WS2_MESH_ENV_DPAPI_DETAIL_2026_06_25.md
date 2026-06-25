# WS-2 세부 플랜 — mesh.env at-rest DPAPI 암호화 (N-3)

> 마스터: `V29_RESIDUAL_MASTER_PLAN_2026_06_25.md`. 단일 파일 변경(`musu-rs/src/install/token.rs`)
> + 회귀 테스트. client-only, production 배포 없음. 검증=`cargo test --lib`.

## 목표
`~/.musu/mesh.env`의 `MUSU_MESH_BEARER`를 Windows에서 **DPAPI(CryptProtectData, CurrentUser
scope)**로 at-rest 암호화. Unix는 평문+0600 유지(DPAPI N/A). 기존 평문 설치 하위호환(silent
재암호화 마이그레이션). 런타임 watcher 재읽기와 정합(read가 decrypt 해야 함).

## 위협 모델 (솔직 기재 — Critic 검증 대상)
- **방어함**: `~/.musu` 디렉토리 클라우드 백업 동기화 / 디스크 도난 / 다른 사용자 계정의 파일
  접근(ACL이 1차, DPAPI가 2차). DPAPI CurrentUser는 같은 Windows 계정 로그인 키로만 복호.
- **방어 못 함**: same-user 악성코드(같은 계정 컨텍스트면 DPAPI도 복호 가능 — ACL/DPAPI 공통
  한계). 이건 의도된 스코프. EV/HSM 급 방어는 YAGNI(단일 사용자 데스크탑 제품).

## 구현 (token.rs 단일 파일)

### 2-A. write 암호화 (`write_mesh_bearer`, 현 line 81-153)
- Windows 분기(현 121-142): bearer를 DPAPI 래핑 → base64 → 라인 키를 `MUSU_MESH_BEARER_DPAPI=`로.
  - `dpapi_protect(plaintext: &[u8]) -> Result<Vec<u8>>` 신규 헬퍼(`#[cfg(windows)]`): `CryptProtectData`
    호출(entropy=null, flags=0=CurrentUser). LocalFree로 blob 해제.
  - body 포맷: 주석 동일 + `MUSU_MESH_BEARER_DPAPI={base64(blob)}\n`.
- Unix 분기(현 103-119): **무변경**. `MUSU_MESH_BEARER={bearer}` 평문 유지.
- ⚠️ body가 OS별로 달라짐 → body 생성을 cfg 분기 안으로 이동(현재는 분기 위에서 공통 생성).
  ACL-first 순서(빈 temp→ACL→secret write→rename) 보존.

### 2-B. read 복호화 (`read_mesh_bearer`, 현 line 52-75)
- 파싱 루프(현 61-72)에 분기 추가:
  - `MUSU_MESH_BEARER_DPAPI=` 감지 → base64 디코드 → `dpapi_unprotect` → 평문 반환.
    `#[cfg(windows)]`. (Unix에서 이 키 만나면 — 비정상, skip하고 다음 라인/None.)
  - `MUSU_MESH_BEARER=` (레거시 평문) → 현행대로 그대로 반환. **하위호환.**
  - env var(`MUSU_MESH_BEARER`, 현 53-58)은 항상 평문(런타임 주입) — 무변경.
- `dpapi_unprotect(blob: &[u8]) -> Result<Vec<u8>>` 신규(`#[cfg(windows)]`): `CryptUnprotectData`.

### 2-C. silent 마이그레이션
- read가 레거시 평문을 읽어도 즉시 재암호화 안 함(read는 부작용 없어야 — watcher가 자주 호출).
- 대신 **다음 `write_mesh_bearer`(re-join/rotate)**가 자동으로 DPAPI 포맷으로 덮어씀. 자연 마이그레이션.
- 추가 안전: 평문 레거시도 계속 읽히므로 brick 없음. (강제 즉시 마이그레이션은 YAGNI.)

### 2-D. windows-sys feature
- `Cargo.toml:144` windows-sys features에 `"Win32_Security_Cryptography"` 추가
  (`CryptProtectData`/`CryptUnprotectData`/`CRYPT_INTEGER_BLOB`(=DATA_BLOB) 거기 있음).
- base64 0.22 이미 있음(`Cargo.toml:61`) — 재사용.

## 테스트 (token.rs tests 모듈)
- `mesh_bearer_dpapi_roundtrips` (`#[cfg(windows)]`): write→read 동등성, 디스크 파일에 평문
  bearer 문자열이 **없음** 단언(`!body.contains(bearer)`), `MUSU_MESH_BEARER_DPAPI=` 존재.
- `legacy_plaintext_mesh_env_still_reads`: 손으로 `MUSU_MESH_BEARER=plain\n` 쓰고 read=Some(plain).
  (양 OS — 하위호환 핵심.)
- `dpapi_then_rewrite_migrates` (`#[cfg(windows)]`): 레거시 평문 write(직접) → read OK →
  write_mesh_bearer로 덮어쓰기 → 파일이 DPAPI 포맷 → read 여전히 OK.
- 기존 `write_then_read_mesh_bearer_roundtrips`/`deleted_mesh_env_reads_none`/`env_overrides_file`
  은 Windows에서 이제 DPAPI 경로 → 여전히 green이어야(read가 양 포맷 처리).

## watcher 정합 (bridge/mod.rs:106-210)
- watcher는 `read_mesh_bearer` 호출만 함(195/204). read가 DPAPI decrypt 처리하므로 **watcher
  코드 무변경.** write→watcher reread→decrypt 동등성이 곧 hot-reload 정합. 단위테스트가 대리 검증.

## 검증
- `cargo test --lib install::token` green (신규 3 + 기존 mesh 3).
- `cargo check` (Windows target) — feature 추가 컴파일.
- 가능하면 실제 `musu mesh join-account` 후 `mesh.env`에 평문 bearer 없음 육안 확인.

## 게이트
- 🔒 production 배포 0. main push=Const VII 배치 승인. design-gate 무관(Rust, src/** 아님).
- Critic=security-engineer (DPAPI scope/entropy/마이그레이션/포맷마커 혼동).
- Auditor=silent-failure-hunter (decrypt 실패 시 None 반환이 bearer 유실로 이어지나? → 레거시
  평문 fallback + write가 복구하므로 safe, but Auditor 확인).

---

## Critic Findings (resolved) — security-engineer, 2026-06-25
crypto(DPAPI CurrentUser, entropy=null)는 **옳다고 확인**. 3 HIGH 전부 에러처리/복구. Builder는
이 표를 PRIOR ARTIFACT로 읽고 반영할 것.

| # | Sev | Claim | Resolution (플랜 amend) |
|---|-----|-------|------------------------|
| H-1 | 🔴 | DPAPI 라인 있으나 decrypt 실패(SID/프로필 변경, blob 손상)시 read=None → **조용히 per-machine 토큰으로 강등**, 로그 없음. "레거시 평문 fallback"은 DPAPI-only 파일엔 거짓(평문 라인 없음). join은 드문 수동 이벤트라 재암호화도 안 일어남. | `read_mesh_bearer` 시그니처 **`Option<String>` 유지**(caller swap_peer_token이 Option). 단 **present-but-undecryptable DPAPI 라인**에서 `tracing::error!`(경로+OS 에러코드) 로그 + 복구법("re-run `musu mesh join-account`") 문서화. None을 "no bearer configured"로 위장 금지. 테스트: `dpapi_line_present_but_undecryptable_logs_and_returns_none`. |
| H-2 | 🔴 | 새 reader 분기 순서 미지정. `MUSU_MESH_BEARER_DPAPI`가 `MUSU_MESH_BEARER`로 시작 — 현재 안전(`strip_prefix("MUSU_MESH_BEARER=")`의 `=`가 구분)하나 플랜이 순서/정확성 안 박음. 약화되면 DPAPI blob을 평문 bearer로 반환=치명적. | reader는 **`MUSU_MESH_BEARER_DPAPI=` 먼저**(most-specific), `MUSU_MESH_BEARER=` 둘째, 둘 다 **정확한 `strip_prefix`(=종단)**. 테스트: DPAPI 라인이 평문 bearer로 verbatim 반환되지 않음 단언(`assert_ne!(result, Some(base64_blob))`). |
| H-3 | 🔴 | `read_mesh_bearer`가 watcher async task(bridge/mod.rs:195,204) 안에서 sync 호출됨. DPAPI는 OS crypto syscall — 로밍 프로필/첫 unlock시 디스크/네트워크 블록 가능 → tokio worker + 45s tick 정체. 플랜의 "watcher 무변경"은 틀림. | bridge/mod.rs:195,204 두 호출을 **`tokio::task::spawn_blocking`으로 래핑**. (read가 syscall이 된 이상 cheap insurance.) 플랜 변경 = watcher 호출부 수정 포함. |
| M-1 | 🟡 | Unix가 Windows발 DPAPI 라인 만나면 "skip+None" = H-1과 같은 조용한 강등(클라우드 sync 시나리오 실재). | Unix에서 DPAPI 라인 만나면 `tracing::warn!("mesh.env was written on Windows (DPAPI); re-run join-account here")`. |
| M-2 | 🟡 | base64 variant 미지정(write/read 불일치시 조용히 decode 실패). unprotect **평문 버퍼**도 LocalFree 필요(플랜은 protect blob만 언급). | `base64::engine::general_purpose::STANDARD` write/read 양쪽 고정. `CryptProtectData`/`CryptUnprotectData` **양쪽 출력 DATA_BLOB.pbData를 LocalFree**, 평문은 즉시 Rust Vec/String 복사 후 OS 버퍼 해제(가능하면 zeroize). |
| L-1 | 🟢 | windows-sys `Win32_Security`엔 Cryptography 없음 — 플랜 2-D가 `Win32_Security_Cryptography` 추가로 이미 정답. | 무변경. Builder 실행만. |
| INFO | ✅ | 위협모델 솔직·완전. CurrentUser(not LocalMachine)가 옳음(LocalMachine은 같은 박스 모든 유저 복호 가능=cross-account 방어 약화). entropy=null 수용. | 무변경. |

**OQ 해소(orchestrator):**
1. decrypt-실패 계약 = `Option` 유지 + 내부 `tracing::error!` + 복구 문서화 (H-1 Resolution).
2. spawn_blocking = **채택**(H-3). 두 호출부 수정.
3. write_mesh_bearer 유일 호출 = join-account → lazy 마이그레이션 **명시 수용**(즉시 opportunistic
   재암호화는 read 부작용화 위험 + YAGNI). 레거시 평문은 계속 읽히므로 brick 없음.
