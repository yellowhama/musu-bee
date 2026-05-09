
import requests
import json
import os
import argparse

COMPANY_ID = os.environ.get("PAPERCLIP_COMPANY_ID")
BASE_URL = "http://127.0.0.1:8070/api"
ENGINEER_ID = "82694791-a72f-4830-9af8-1c54eebe45cb"

def create_issue(title, description, assignee_id):
    issue_data = {
        "title": title,
        "description": description,
        "assigneeAgentId": assignee_id,
        "priority": "high"
    }

    try:
        response = requests.post(f"{BASE_URL}/companies/{COMPANY_ID}/issues", json=issue_data)
        response.raise_for_status()
        print("--- Issue Created ---")
        print(json.dumps(response.json(), indent=2))
    except requests.exceptions.RequestException as e:
        print(f"Error creating issue: {e}")
        if e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    if not COMPANY_ID:
        print("Error: PAPERCLIP_COMPANY_ID environment variable not set.")
    else:
        parser = argparse.ArgumentParser(description="Create a new issue in Paperclip.")
        parser.add_argument("--title", required=True, help="The title of the issue.")
        parser.add_argument("--description", required=True, help="The description of the issue.")
        parser.add_argument("--assignee_id", default=ENGINEER_ID, help="The ID of the agent to assign the issue to.")
        args = parser.parse_args()
        create_issue(args.title, args.description, args.assignee_id)
