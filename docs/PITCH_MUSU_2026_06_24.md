# MUSU — 1분 피칭 + 메시징 소스 (2026-06-24)

재사용 가능한 메시징 소스. 랜딩/스토어/투자자 덱/SNS 카피의 단일 출처.
랜딩 히어로(`musu-bee/src/app/page.tsx:102-134`) 교체 시 이 문서의 영문 카피를 출처로 쓰되,
교체는 design-gate 정식 통과(아티팩트+brief+`Design: Approved`) 대상 — 별도 작업.

---

## 핵심 한 줄 (positioning)
**"경쟁자가 '당신 데이터를 우리 서버로 보내세요'라고 할 때, MUSU는 '당신 서버를 똑똑하게 만들어
드립니다'라고 말한다."**
EN: *"While competitors say 'send us your data,' MUSU says 'we make your machines smart.'"*

## 1분 피칭 (한국어)
당신 책상엔 PC가 여러 대 있습니다. 메인 데스크탑, 작업실 머신, 노트북. 그런데 정작 일을 시킬 땐
한 대 앞에 앉아야 하죠. 나머지는 그냥 꺼져가는 전기난로입니다.

MUSU는 그 PC들을 **한 대의 기기처럼** 묶습니다. 설치는 더블클릭 하나 — Docker도, 클라우드 계정도,
터미널 명령어도 없습니다. 설치하면 PC가 알아서 서로를 찾아 함대(fleet)가 됩니다.

그러면 어디서든 — 노트북에서, 웹에서, 외출 중에 폰으로도 — "이 작업 해줘" 하면, MUSU가 가장 여유
있는 머신을 골라 거기서 돌립니다. GPU 무거운 일은 데스크탑이, 가벼운 건 노트북이. 당신은 어느 PC가
하는지 신경 안 써도 됩니다. 함대가 알아서 합니다.

핵심은 **당신 것이라는 점**입니다. AI도, 데이터도, 작업도 전부 당신 머신 안에서 돕니다. 월 구독으로
남의 클라우드에 당신 코드와 파일을 올리는 게 아니라, 이미 가진 하드웨어를 깨워서 씁니다. 외부
서비스가 망해도, 가격을 올려도, MUSU는 그대로 돕니다 — 자기완결적이니까요.

## 1-Minute Pitch (English)
You've got several computers on your desk. A main desktop, a workshop machine, a laptop. But when you
actually need work done, you have to sit down at one of them. The rest are just space heaters slowly
cooling off.

MUSU ties those machines together so they act like **one device**. Install is a single double-click —
no Docker, no cloud account, no terminal commands. Once installed, your machines find each other and
form a fleet.

Then, from anywhere — your laptop, the web, even your phone while you're out — you just say "do this
task," and MUSU picks the machine with the most headroom and runs it there. GPU-heavy work goes to the
desktop, light work to the laptop. You never think about *which* machine does it. The fleet handles that.

The point is: **it's yours.** The AI, the data, the work — all of it runs inside your own machines.
You're not uploading your code and files to someone else's cloud on a monthly subscription; you're
waking up the hardware you already own. When an external service dies or raises its price, MUSU keeps
running — because it's self-contained.

## 메시지 기둥 (message pillars)
| # | 기둥 | 한 줄 | EN |
|---|------|-------|----|
| 1 | One device | 여러 PC를 한 대처럼 | Many machines, one device |
| 2 | Zero-friction install | 더블클릭 하나, Docker/터미널/계정 없음 | One double-click — no Docker, no account |
| 3 | Auto-routing | 가장 여유 있는 머신이 알아서 맡음 | The fleet routes work to whoever has headroom |
| 4 | It's yours (self-contained) | AI·데이터·작업 전부 당신 머신 안 | Your AI, your data, your machines |
| 5 | Antifragile | 외부 SaaS 망해도/올라도 그대로 | External service dies? MUSU keeps running |

## 차별화 (vs 클라우드 SaaS)
- 경쟁: "당신 데이터를 우리 서버로 보내세요" (구독, 데이터 외부화, 가격 인상 리스크).
- MUSU: "당신 서버를 똑똑하게 만들어 드립니다" (소유, 데이터 로컬, 자기완결).

## 현 단계 (상태)
안정화 — 함대 연결(F-3 3-state), 자동 업데이트(.appinstaller + 인-앱 알림 토스트), 데스크탑
조종석을 상용(S-tier) 품질로 다듬는 중.

## 카피 변형 (짧은 버전)
- 태그라인: "Your computers, as one." / "여러 컴퓨터, 하나처럼."
- 히어로(현행): "Give a machine work. Walk away."
- 차별화 한 줄: "We don't take your data to the cloud. We make your cloud."

## 현 랜딩 카피 (참고, page.tsx:102-134)
- eyebrow: "Your computers, as one"
- h1: "Give a machine work. / Walk away."
- sub: "MUSU is a desktop cockpit for your own machines. Pick a computer, give it an order in one box,
  and walk away — MUSU runs it on that machine and taps you when it's done. Your machines join over a
  private mesh you host yourself; no account on someone else's network."
- 갭: self-contained/antifragile/차별화(vs SaaS) 각도가 약함 → 랜딩 교체 시 보강 후보.
