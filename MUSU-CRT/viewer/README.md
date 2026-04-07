# MUSU-CRT Viewer

`MUSU-CRT/viewer`는 원본 MUSU의 `Screen` 탭을 read-only mock으로 재현한 viewer다.

## 실행

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

브라우저:

```text
http://127.0.0.1:8788/MUSU-CRT/viewer/
```

## 현재 범위

- screen tab header
- group selector
- grouped sections
- thumbnail cards
- focused stream mock
- WebRTC stage pills

## 비범위

- 실제 WebRTC
- 실제 thumbnail polling
- terminal attach
- clipboard sync
