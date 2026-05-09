import datetime
import subprocess

def generate_heartbeat_report():
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')
    report_filename = f"heartbeat_report_{timestamp}.md"

    with open(report_filename, 'w') as f:
        f.write(f"System Status Report for {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        f.write("## System Information\n")
        f.write(subprocess.run(["uname", "-a"], capture_output=True, text=True).stdout)
        f.write("\n")

        f.write("## Disk Usage\n")
        f.write(subprocess.run(["df", "-h"], capture_output=True, text=True).stdout)
        f.write("\n")
f.write("## Running Processes (Top 10 by CPU)\n")
f.write(subprocess.run(["ps", "aux", "--sort=-%cpu"], capture_output=True, text=True).stdout.splitlines()[0])
f.write("\n")
f.write("\n".join(subprocess.run(["ps", "aux", "--sort=-%cpu"], capture_output=True, text=True).stdout.splitlines()[1:11]))
f.write("\n")
        f.write("\n")

    print(f"Report generated: {report_filename}")
    print(report_filename)

if __name__ == "__main__":
    generate_heartbeat_report()
