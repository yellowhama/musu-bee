import platform
import shutil
import psutil
import datetime
import httpx
import os

def _get_bridge_token() -> str:
    """Return auth headers for musu-bridge requests."""
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
    if not token:
        _token_file = os.path.expanduser("~/.musu/bridge_token")
        try:
            with open(_token_file) as _f:
                token = _f.read().strip()
        except OSError:
            pass
    return token

def generate_heartbeat_report():
    report_filename = f"heartbeat_report_Gemini_CLI_Device_Status_{datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')}.md"

    with open(report_filename, "w") as f:
        f.write(f"System Status Report for {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("\n")

        f.write("## System Information\n")
        f.write(f"- Operating System: {platform.system()}\n")
        f.write(f"- Node Name: {platform.node()}\n")
        f.write(f"- Release: {platform.release()}\n")
        f.write(f"- Version: {platform.version()}\n")
        f.write(f"- Machine: {platform.machine()}\n")
        f.write(f"- Processor: {platform.processor()}\n")
        f.write(f"- Platform: {platform.platform()}\n")
        f.write("\n")

        f.write("## Disk Usage\n")
        total, used, free = shutil.disk_usage('.')
        f.write(f"Total: {total/(1024**3):.2f} GB\n")
        f.write(f"Used: {used/(1024**3):.2f} GB\n")
        f.write(f"Free: {free/(1024**3):.2f} GB\n")
        f.write("\n")

        f.write("## Running Processes (Top 10 by CPU)\n")
        f.write("```\n")
        # Get all processes
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                processes.append(proc.info)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass

        # Sort by CPU usage and get top 10
        top_processes = sorted(processes, key=lambda x: x['cpu_percent'], reverse=True)[:10]

        f.write(f"{'PID':<8} {'%CPU':<8} {'%MEM':<8} {'Name':<50}\n")
        f.write(f"{'':-<8} {'':-<8} {'':-<8} {'':-<50}\n")
        for p in top_processes:
            f.write(f"{p['pid']:<8} {p['cpu_percent']:<8.2f} {p['memory_percent']:<8.2f} {p['name']:<50}\n")
        f.write("```\n")
        f.write("\n")

        f.write("## Recent Activity (from Musu Control Plane)\n")
        try:
            bridge_url = os.environ.get("MUSU_BRIDGE_URL", "http://127.0.0.1:8070")
            token = _get_bridge_token()
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            
            # Use httpx.Client for synchronous call in a script
            with httpx.Client(base_url=bridge_url, headers=headers, timeout=15.0) as client:
                activity_response = client.get("/api/activity", params={"limit": 10}).json()
                
            if activity_response and isinstance(activity_response, list):
                for activity_item in activity_response:
                    if isinstance(activity_item, dict):
                        event = activity_item.get("event_type", activity_item.get("action", "?"))
                        agent = activity_item.get("agent_name", activity_item.get("agent", ""))
                        ts = activity_item.get("created_at", activity_item.get("timestamp", ""))
                        f.write(f"- [{agent}] {event} ({ts})\n")
            else:
                f.write("- No recent activity found or unexpected response format.\n")
        except Exception as e:
            f.write(f"- Failed to retrieve activity: {e}\n")


    return report_filename

if __name__ == "__main__":
    filename = generate_heartbeat_report()
    print(f"Report generated: {filename}")
