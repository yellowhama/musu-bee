#!/bin/bash
REPORT_FILENAME="heartbeat_report_$(date '+%Y-%m-%d-%H%M%S').md"
echo "System Status Report for $(date '+%Y-%m-%d %H:%M:%S')" > "$REPORT_FILENAME"
echo "" >> "$REPORT_FILENAME"
echo "## System Information" >> "$REPORT_FILENAME"
uname -a >> "$REPORT_FILENAME"
echo "" >> "$REPORT_FILENAME"
echo "## Disk Usage" >> "$REPORT_FILENAME"
df -h >> "$REPORT_FILENAME"
echo "" >> "$REPORT_FILENAME"
echo "## Running Processes (Top 10 by CPU)" >> "$REPORT_FILENAME"
ps aux --sort=-%cpu | head -n 11 >> "$REPORT_FILENAME"
echo "Report generated: $REPORT_FILENAME"
echo "$REPORT_FILENAME" # Echo the filename for capture