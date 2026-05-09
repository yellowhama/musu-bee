System Status Report for 2026-05-07 05:58:10

## System Information
Linux hughsecond 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux

## Disk Usage
- `/dev/sde`: 55% used (66M/129M)
- `drivers`: 90% used (837G/931G)
- `/dev/sdd`: 32% used (305G/1007G)
- `C:`: 90% used (837G/931G)
- `D:`: 100% used (3.7T/3.7T)
- `E:`: 100% used (3.7T/3.7T)
- `G:`: 99% used (7.2T/7.3T)
- `snapfuse` (core24/1587): 100% used (67M/67M)
- `snapfuse` (core24/1499): 100% used (67M/67M)
- `snapfuse` (snapd/26865): 100% used (50M/50M)

## Running Processes (Top 10 by CPU)
1. `hugh51       599 55.9  0.6 1541732 155280 ?      Sl    5월05 1474:43 /home/hugh51/.musu/bin/forgejo web -c /home/hugh51/.musu/forgejo/custom/conf/app.ini`
2. `hugh51   3479260 22.3  2.1 76681232 524984 pts/4 Sl+   5월06 110:12 claude --resume bf9a02b6-72fc-4185-8184-f86a0ea27e89`
3. `hugh51   1958372 19.7  2.5 76841188 623172 pts/6 Rl+   5월06 241:39 claude`
4. `hugh51    696745 19.6  1.0 27406644 264772 ?     Sl   05:57   0:07 /usr/bin/node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e`
5. `hugh51    696182  7.7  1.1 10632360 272380 ?     Sl   05:57   0:03 node --no-warnings=DEP0040 /home/hugh51/.npm-global/bin/gemini --output-format stream-json --prompt heartbeat: 현재 기기 상태 보고해줘 --model gemini-2.5-flash --yolo -e`
6. `hugh51   1895045  2.9  0.7 557120 185424 pts/5   Sl+   5월06  37:06 /home/hugh51/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex`
7. `hugh51   1958460  2.4  0.6 325060 156808 pts/6   Sl+   5월06  29:46 /home/hugh51/musu-functions/musu-indexer/.venv/bin/python3 /home/hugh51/musu-functions/musu-indexer/.venv/bin/musu-indexer mcp`
8. `hugh51    697330  1.8  0.2 211188 54060 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-writer/.venv/bin/python3 /home/hugh51/musu-functions/musu-writer/.venv/bin/musu-writer mcp`
9. `hugh51    697329  1.8  0.2 220776 57928 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-control/.venv/bin/python3 /home/hugh51/musu-functions/musu-control/.venv/bin/musu-control`
10. `hugh51    697331  1.7  0.2 211820 53608 ?        Sl   05:57   0:00 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/python3 /home/hugh51/musu-functions/musu-ai-detector/.venv/bin/musu-ai-detector mcp`