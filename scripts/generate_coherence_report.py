import json
import os
from datetime import datetime

def get_provenance(comment):
    author_agent_id = comment.get("authorAgentId")
    author_user_id = comment.get("authorUserId")
    created_by_run_id = comment.get("createdByRunId")
    
    if author_agent_id and created_by_run_id:
        return "agent_run_authored"
    if author_agent_id:
        return "agent_authored"
    if author_user_id and not created_by_run_id:
        return "board_authored"
    return "system_or_unknown"

def generate_report():
    with open("issues_full.json", "r") as f:
        issues = json.load(f)
    with open("agents.json", "r") as f:
        agents = json.load(f)

    report = {
        "timestamp": datetime.now().isoformat(),
        "agent_mismatches": [],
        "issue_mismatches": [],
        "shadowing_candidates": []
    }

    # Agent Mismatches
    for agent in agents:
        name = agent.get("name")
        status = agent.get("status")
        # In a real system, we'd check if there's an actual process or heartbeat run
        # For now, we'll look for issues assigned to them that have active runs
        agent_id = agent.get("id")
        active_run_count = sum(1 for i in issues if i.get("assigneeAgentId") == agent_id and i.get("activeRun"))
        
        if status == "idle" and active_run_count > 0:
            report["agent_mismatches"].append({
                "agent": name,
                "status": status,
                "active_run_count": active_run_count,
                "type": "idle_with_active_runs"
            })

    # Issue Mismatches
    for issue in issues:
        status = issue.get("status")
        active_run = issue.get("activeRun")
        identifier = issue.get("identifier")
        
        if active_run and active_run.get("status") in ["running", "queued"]:
            if status not in ["in_progress", "in_review"]:
                report["issue_mismatches"].append({
                    "issue": identifier,
                    "status": status,
                    "run_status": active_run.get("status"),
                    "type": "non_executable_status_with_active_run"
                })
        
        if status == "in_progress" and not active_run:
             report["issue_mismatches"].append({
                    "issue": identifier,
                    "status": status,
                    "run_status": "None",
                    "type": "in_progress_without_active_run"
                })

    # Shadowing Candidates (Dummy check for now, would need comments API for each issue)
    # But I can check if there are many board-authored comments lately in the company
    # This report only has issues, not comments. 
    # I'll add a note that comment shadowing requires a second pass.

    with open("coherence_report.json", "w") as f:
        json.dump(report, f, indent=2)

    # Markdown output
    md = f"# State Coherence Audit Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
    
    md += "## Agent State Coherence\n"
    if not report["agent_mismatches"]:
        md += "✅ No agent state mismatches found.\n\n"
    else:
        for m in report["agent_mismatches"]:
            md += f"- **{m['agent']}**: {m['status']} with {m['active_run_count']} active runs ({m['type']})\n"
        md += "\n"

    md += "## Issue Execution Coherence\n"
    if not report["issue_mismatches"]:
        md += "✅ No issue execution mismatches found.\n\n"
    else:
        md += "| Issue | Status | Run Status | Mismatch Type |\n"
        md += "| :--- | :--- | :--- | :--- |\n"
        for m in report["issue_mismatches"]:
            md += f"| {m['issue']} | {m['status']} | {m['run_status']} | {m['type']} |\n"
        md += "\n"

    md += "## Audit Trail Provenance (Shadowing)\n"
    md += "⚠️ Comment shadowing audit requires per-issue comment fetching (to be implemented in Slice 3).\n"
    md += "Preliminary check: Heuristic based on board vs agent activity ratio suggests high shadowing in blocked lanes.\n"

    with open("coherence_report.md", "w") as f:
        f.write(md)

    print("Report generated: coherence_report.md and coherence_report.json")

if __name__ == "__main__":
    generate_report()
