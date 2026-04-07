# Packaged Install Blocker Research

Date: 2026-04-02

## Question

왜 현재 호스트에서 `scripts/run-packaged-install-smoke.sh`가 `python3-venv/ensurepip` 단계에서 막히는지, 그리고 어떤 우회 경로가 공식 문서 기준으로 타당한지 정리한다.

## Findings

1. Python `venv`는 기본적으로 `ensurepip`를 통해 `pip`를 넣는다.
   - Python 공식 문서: `venv`의 `with_pip`는 `ensurepip --default-pip`를 사용한다.
   - Source:
     - https://docs.python.org/3/library/venv.html
     - https://docs.python.org/3/library/ensurepip.html

2. Ubuntu는 `python3`만 설치되면 최소 런타임만 보장하고, 더 완전한 개발 환경은 `python3-full`을 권장한다.
   - Ubuntu for Developers 문서에서 `python3-full`이 `venv`와 full stdlib를 포함한다고 명시한다.
   - Source:
     - https://documentation.ubuntu.com/ubuntu-for-developers/howto/python-setup/

3. Debian/Ubuntu 계열은 system Python에서 `ensurepip`를 제한하는 패치 전례가 있다.
   - Debian source의 `ensurepip` 패치에는 system python에서는 `ensurepip`를 막고 패키지 관리자를 쓰라고 유도하는 로직이 들어 있다.
   - Source:
     - https://sources.debian.org/src/python3.5/3.5.3-1%2Bdeb9u1/Lib/ensurepip/__init__.py/

4. `uv`는 system `python3 -m venv`가 막혀도 대체 venv bootstrap 경로가 될 수 있다.
   - Astral 공식 문서에는 `uv venv --seed`로 pip가 포함된 가상환경을 만드는 흐름이 나온다.
   - Source:
     - https://docs.astral.sh/uv/guides/integration/jupyter/
     - https://docs.astral.sh/uv/pip/compatibility/

## Implications For Musu Indexer

- 현재 host blocker는 `musu-indexer` 코드 결함이라기보다, Ubuntu/Debian 계열 Python 패키징 정책과 host package 상태의 영향이 크다.
- 따라서 packaged-install smoke는 다음 순서로 설계하는 것이 맞다.
  - 1. `python3 -m venv`
  - 2. 실패 시 `uv venv --seed`
  - 3. 둘 다 불가하면 명시적으로 `blocked`
- release evidence도 단순 실패/성공이 아니라, 어떤 bootstrap backend가 선택되었는지 남겨야 한다.

## Decision

- `scripts/run-packaged-install-smoke.sh`에 `uv` fallback과 backend reporting을 넣는다.
- master plan에는 host prerequisite 검증과 bootstrap fallback을 별도 phase로 분리한다.
- 실제 final closeout은 `python3-full` 또는 `uv`가 있는 host에서 다시 실행해서 evidence를 남긴다.
