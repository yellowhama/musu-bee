
import requests
import json
import os

COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
BASE_URL = "http://127.0.0.1:8070/api"
ISSUE_ID = "14952105-c96e-4995-aec4-4e93baa8484e"

def add_comment():
    with open("BUTLER_DIAGNOSIS_2026-05-06.md", "r") as f:
        comment_body = f.read()

    comment_data = {
        "body": comment_body
    }

    try:
        response = requests.post(f"{BASE_URL}/issues/{ISSUE_ID}/comments", json=comment_data)
        response.raise_for_status()
        print("--- Comment Added ---")
        print(json.dumps(response.json(), indent=2))
    except requests.exceptions.RequestException as e:
        print(f"Error adding comment: {e}")
        if e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    add_comment()
