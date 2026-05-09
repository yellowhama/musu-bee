
import requests
import json
import os
import argparse

COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
BASE_URL = "http://127.0.0.1:8070/api"

def create_issue(title, description):
    issue_data = {
        "title": title,
        "description": description,
        "priority": "high"
    }

    try:
        response = requests.post(f"{BASE_URL}/companies/{COMPANY_ID}/issues", json=issue_data)
        response.raise_for_status()
        print("--- Issue Created ---")
        print(json.dumps(response.json(), indent=2))
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error creating issue: {e}")
        if e.response:
            print(f"Response: {e.response.text}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a Paperclip issue.")
    parser.add_argument("--title", required=True, help="The title of the issue.")
    parser.add_argument("--description", required=True, help="The description of the issue.")
    
    args = parser.parse_args()
    
    create_issue(args.title, args.description)
