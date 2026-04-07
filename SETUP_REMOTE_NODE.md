# MUSU Remote Node 설치 가이드

> **이 컴퓨터에서는 코드를 수정하지 마세요.** 설치 + 실행만.
> 코드 수정은 메인 노드(4060Ti)에서만 합니다.

## 1. 사전 요구사항

```bash
# WSL Ubuntu 기준
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev curl git
```

## 2. Rust 설치

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
```

## 3. 레포 클론

```bash
cd ~
git clone https://github.com/yellowhama/musu-bee.git
cd musu-bee
```

## 4. 빌드

```bash
cd ~/musu-bee/musu-port && cargo build --release
cd ~/musu-bee/musu-connects && cargo build --release
```

빌드 결과:
- `~/musu-bee/musu-port/target/release/musu-portd`
- `~/musu-bee/musu-connects/target/release/musu-connectsd`

## 5. 자동 업데이트 설정

메인 노드에서 코드를 push하면 이 노드가 자동으로 pull + 재빌드합니다.

```bash
# 업데이트 스크립트 설치
cp ~/musu-bee/scripts/remote-node-update.sh ~/musu-bee/
chmod +x ~/musu-bee/remote-node-update.sh

# cron 등록 (5분마다 체크)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/$USER/musu-bee/remote-node-update.sh >> /home/$USER/musu-bee/update.log 2>&1") | crontab -

# 확인
crontab -l
```

## 6. 서비스 실행

```bash
# musu-portd
~/musu-bee/musu-port/target/release/musu-portd

# musu-connectsd (별도 터미널)
~/musu-bee/musu-connects/target/release/musu-connectsd
```

## 7. 확인

```bash
# 포트 확인
curl -sf http://127.0.0.1:PORT/health || echo "서비스 안 뜸"
```

---

## 절대 하지 말 것

- `git commit` / `git push` 하지 마세요
- 코드 파일 수정하지 마세요
- `cargo.toml` 건드리지 마세요
- 문제 있으면 메인 노드(4060Ti)에서 고쳐서 push하면 자동 반영됩니다
