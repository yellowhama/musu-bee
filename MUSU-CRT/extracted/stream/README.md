# Extracted Stream Candidates

이 폴더는 `useRealtimeStream.ts`를 통째로 옮기기 전에,
local polling path와 remote path를 분리해서 볼 수 있도록 추출 후보 단위를 둔다.

현재 포함:

- `contract.ts`
- `local_frame_adapter.ts`
- `frame_parser.ts`
- `metrics_collector.ts`
- `reconnect_policy.ts`
- `remote_session_adapter.ts`
