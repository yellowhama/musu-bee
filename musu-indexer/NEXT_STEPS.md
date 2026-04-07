# Musu Indexer Next Steps

Date: 2026-04-02

## Current Gate

로컬 smoke와 코드/문서 정리는 끝났다. 남은 gate는 packaged-install validation을 suitable host에서 다시 실행해 final evidence를 남기는 것이다.

## Current Evidence

- latest validation bundle:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/validation-bundle-20260402T121838Z.txt`
- latest host prereq report:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-host-prereqs-20260402T121838Z.txt`
- latest packaged smoke report:
  - `/home/hugh51/musu-functions/musu-indexer/work/validation/packaged-install-smoke-20260402T121838Z.txt`

## What To Run On A Suitable Host

### Base Validation

```bash
cd /home/hugh51/musu-functions/musu-indexer
bash scripts/run-validation-bundle.sh
```

Expected:

- `bundle_status: success`
- `host_prereqs_status: ready`
- `smoke_status: success`
- `packaged_status: success`

### Extras Validation

```bash
cd /home/hugh51/musu-functions/musu-indexer
bash scripts/run-validation-bundle.sh --online-extras
```

Expected:

- base validation success
- extras install checks succeed in packaged smoke report

## Host Requirements

- Either:
  - working `python3 -m venv` with `pip`
- Or:
  - installed `uv` with working `uv venv --seed`

## Closeout

After a successful run:

1. update `RELEASE_CHECKLIST.md` with the latest bundle report path
2. update `HANDOFF.md` and `MASTER_PLAN.md` to mark Phase 09 done
3. check off the remaining Phase 09 items in `TODO.md`
