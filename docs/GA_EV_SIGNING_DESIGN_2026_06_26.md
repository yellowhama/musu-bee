# GA EV 직접서명 경로 설계 (큐잉, 2026-06-26)

> **상태: 설계만 (코드 미작성).** EV/OV 코드서명 인증서 확보(외부 게이트: 구매 + 조직검증,
> 수일~수주)가 **선행**돼야 실동작한다. 이 문서는 인증서가 확보됐을 때 무엇을 어떻게 바꿀지의
> 골격이다. 현재 GA 메인 경로는 **MS Store 재서명**(사용자 결정 2026-06-26); EV는 Store 없이
> 가는 대안 트랙으로 보존.

## 왜 EV 트랙을 별도로 두는가
현재 musu는 self-signed 베타 cert(thumbprint `65F5926444D563966C75F000C384C8530B1D8DD8`)로
서명한 MSIX를 배포한다. 설치 시 사용자가 cert를 **수동 신뢰**해야 한다(`Install-MUSU.ps1` [2/4],
admin 권한 필요). EV/OV 코드서명 인증서로 서명하면 인증서가 **공개 신뢰 루트(Trusted Root)에
체이닝**되므로 이 수동 신뢰 단계가 통째로 불필요해진다 — Store에 종속되지 않고 자체 호스팅(.appinstaller
자동업데이트)을 유지하면서 "한 번에 설치"가 된다.

**Store 재서명 vs EV 직접서명 (트레이드오프):**
- Store: 인프라 80% 준비됨, MS가 재서명·호스팅·업데이트. 단 Partner Center 제출 + MS 리뷰
  (restricted-capability `runFullTrust`) 통과 필요, 자체 .appinstaller 자동업데이트 포기.
- EV: 자체 호스팅·.appinstaller 자동업데이트 유지, Store 리뷰 불필요. 단 EV 인증서 비용 +
  **HSM/USB 토큰 서명**(EV 키는 파일 pfx로 못 둠) → 현재 winapp `--cert pfx` 파이프라인 재설계 필요.

## 현재 서명 파이프라인 (실측 기준선)
- 서명 도구: **winapp CLI**(`winapp pack --cert <pfx> --cert-password`), signtool 미사용.
  `build-msix.ps1:658-660`.
- 인증서 해결: canonical `.local-build\signing\blossompark.musu.pfx`(gitignored, 빌드마다 동일 키
  재사용 → thumbprint 안정 → .appinstaller 자동업데이트 유지). `build-msix.ps1:574-578`.
- cert 비밀번호 기본값 `"password"`(평문). `build-msix.ps1:46`.
- 사용자 신뢰: `Install-MUSU.ps1` [1/4] cert 다운로드 → [2/4] thumbprint 핀 검증 후
  `Import-Certificate -CertStoreLocation Cert:\LocalMachine\TrustedPeople`(머신레벨, admin).

## EV 전환 시 변경 골격 (인증서 확보 후 구현할 것)

### 1. 서명 파이프라인 (build-msix.ps1)
- **winapp `--cert pfx` 모델 폐기.** EV 키는 파일 pfx에 둘 수 없고 HSM/USB 토큰(또는 클라우드 HSM:
  Azure Trusted Signing, DigiCert KeyLocker 등)에 있다. 두 갈래:
  - (a) **signtool + HSM CSP/KSP**: `signtool sign /fd SHA256 /sha1 <EV thumbprint> /tr <timestamp>`로
    토큰 기반 서명. winapp pack(미서명) → signtool 후처리 서명으로 분리. timestamp 서버 필수(인증서
    만료 후에도 서명 유효).
  - (b) **클라우드 서명 서비스**(Azure Trusted Signing 권장 — EV 동등 평판, 토큰 불필요, CI 친화):
    winapp/MakeAppx로 미서명 패키지 → 클라우드 서명 API. self-contained 원칙엔 외부 의존이지만
    **빌드 타임만**(런타임 SaaS 아님)이라 product self-contained 위반 아님.
- canonical pfx 경로 + 평문 비번 기본값(`build-msix.ps1:46,574`) 제거/조건분기.
- thumbprint 안정성: EV 인증서 갱신 시 thumbprint 바뀜 → .appinstaller 자동업데이트 영향 검토
  (Publisher CN이 같으면 PackageFamily 해시는 유지되므로 업데이트 체인은 끊기지 않음 — 단 확인 필요).

### 2. 사용자 설치 (Install-MUSU.ps1)
- **[1/4] cert 다운로드 + [2/4] thumbprint 핀 신뢰 단계 통째 제거.** EV는 공개 루트 체이닝이라
  TrustedPeople import 불필요. 결과: `Install-MUSU.ps1`은 [3/4] `Add-AppxPackage`만 남고
  **self-elevation(admin)도 불필요**(머신레벨 cert store 안 건드림).
- ⚠️ 단 V33 WS-3에서 추가한 견고화(0x800B0109 핸들, elevated 자식창 에러 표시 등) 중 cert-trust
  관련은 EV에선 무의미해지므로, EV 전환 시 그 분기도 함께 정리.
- `publicRelease.ts:22,29` 주석("Removed entirely once the Store release ships")은 Store 기준 —
  EV 트랙이면 "Removed once EV signing ships"로 동일 적용.

### 3. 검증
- EV 서명 후 `Get-AuthenticodeSignature <msix>` → `Valid` + 체인이 공개 루트로. SmartScreen 평판은
  초기엔 낮을 수 있음(EV는 즉시 평판 부여가 강점이나, 신규 게시자는 누적 필요할 수 있음 — 확인).
- 클린 머신(cert 수동 신뢰 안 한)에서 `Add-AppxPackage`가 0x800B0109 없이 통과하는지 실측.

## 선행 조건 (외부 게이트)
1. EV 또는 OV 코드서명 인증서 구매(DigiCert/Sectigo/GlobalSign 등) — 조직 검증 수일~수주.
   또는 Azure Trusted Signing 구독(MS 계정 + 개인/조직 검증).
2. HSM/토큰 또는 클라우드 서명 자격 확보.
3. CI/빌드 머신에 서명 자격 연결(토큰은 물리, 클라우드는 자격증명).

## 큐잉 메모
이 트랙은 Store 경로(메인)와 **상호 배타 아님** — 둘 다 가능. Store가 MS 리뷰에 막히거나 자체
자동업데이트(.appinstaller)를 포기하기 싫으면 EV로 전환. 인증서 확보가 트리거.
관련: `WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`, `STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md`,
`publicRelease.ts`(게시 URL), `build-msix.ps1`(서명).
