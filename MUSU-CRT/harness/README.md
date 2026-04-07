# MUSU-CRT Harnesses

이 디렉터리는 `MUSU-CRT`의 plane별 mock harness를 담는다.

현재 포함:

- `signaling/`
- `stream-lifecycle/`
- `terminal-data-plane/`

## 실행

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

열기:

- `http://127.0.0.1:8788/MUSU-CRT/harness/signaling/`
- `http://127.0.0.1:8788/MUSU-CRT/harness/stream-lifecycle/`
- `http://127.0.0.1:8788/MUSU-CRT/harness/terminal-data-plane/`
