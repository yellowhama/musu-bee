
import os
import subprocess
import sys
import requests
import json

if len(sys.argv) < 2:
    print("Usage: python3 butler_script.py <company_id>")
    sys.exit(1)

company_id = sys.argv[1]
api_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:8070") # Default to localhost
api_key = os.environ.get("PAPERCLIP_API_KEY", "") # Use empty string if not found
run_id = os.environ.get("PAPERCLIP_RUN_ID", "") # Use empty string if not found


headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "X-Paperclip-Run-Id": run_id,
}

results = {}

def fetch_and_print(name, url, method='get', data=None):
    print(f"--- {name} ---")
    try:
        if method == 'get':
            response = requests.get(url, headers=headers, timeout=30)
        elif method == 'post':
            response = requests.post(url, headers=headers, json=data, timeout=30)
        
        response.raise_for_status()
        
        results[name] = response.json()
        print(f"Status Code: {response.status_code}")
        print(json.dumps(results[name], indent=2, ensure_ascii=False))

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
        results[name] = {"error": str(e)}
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from response.")
        results[name] = {"error": "Invalid JSON response"}


# 1. Create issue
issue_data = {
    "title": "[butler] team_lead 채널에 에이전트가 매핑되지 않았습니다.",
    "description": "진단 시스템이 다음 오류와 함께 실패한 작업을 보고했습니다: `[team_lead] No agent mapped to channel: 'team_lead'`. 'team_lead' 채널에 대한 라우팅 또는 구성 문제를 해결하기 위해 이 이슈를 생성합니다.",
    "priority": "high",
}
fetch_and_print("Create Issue", f"{api_url}/api/companies/{company_id}/issues", method='post', data=issue_data)

# 2. Get Dashboard
fetch_and_print("Dashboard", f"{api_url}/api/companies/{company_id}/dashboard")

# 3. List Agents
fetch_and_print("Agents", f"{api_url}/api/companies/{company_id}/agents")

# 4. List Goals
fetch_and_print("Goals", f"{api_url}/api/companies/{company_id}/goals")

# 5. List Issues
fetch_and_print("Issues", f"{api_url}/api/companies/{company_id}/issues")

print("\n--- All results ---")
print(json.dumps(results, indent=2, ensure_ascii=False))
