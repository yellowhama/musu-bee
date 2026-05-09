
import os
import requests
import json
import argparse

company_id = "487f7734-bd80-4bf6-b63f-1efa18c50c94"
api_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:8070")
api_key = os.environ.get("PAPERCLIP_API_KEY", "")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

def add_comment(issue_id, comment_body):
    comment_data = {
        "body": comment_body,
        "author_id": "butler-bot"
    }

    print(f"--- Adding comment to issue {issue_id} ---")
    try:
        response = requests.post(f"{api_url}/api/issues/{issue_id}/comments", headers=headers, json=comment_data, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from response.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add a comment to an issue.")
    parser.add_argument("--issue-id", required=True, help="The ID of the issue to add the comment to.")
    parser.add_argument("--comment", required=True, help="The body of the comment.")
    args = parser.parse_args()
    add_comment(args.issue_id, args.comment)
