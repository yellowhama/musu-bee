
import requests
import json
import os

COMPANY_ID = "a2699373-3700-4cbc-8477-c70e1d94cf8a"
BASE_URL = "http://127.0.0.1:8070/api"
ISSUE_ID = "14952105-c96e-4995-aec4-4e93baa8484e"

def get_data(endpoint):
    try:
        response = requests.get(f"{BASE_URL}{endpoint}")
        response.raise_for_status()
        print(f"--- {endpoint} ---")
        print(json.dumps(response.json(), indent=2))
    except requests.exceptions.RequestException as e:
        print(f"Error fetching {endpoint}: {e}")
        if e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    get_data(f"/issues/{ISSUE_ID}")
