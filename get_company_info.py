
import os
import requests
import json

company_id = "f27a9bd2-688a-450b-98b4-f63d24b0ab50"
api_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:8070")
api_key = os.environ.get("PAPERCLIP_API_KEY", "")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

def fetch_and_print(name, url):
    print(f"--- {name} ---")
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from response.")

fetch_and_print("Goals", f"{api_url}/api/companies/{company_id}/goals")
fetch_and_print("Issues", f"{api_url}/api/companies/{company_id}/issues")
