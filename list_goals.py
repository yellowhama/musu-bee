
import os
import requests
import json

company_id = "487f7734-bd80-4bf6-b63f-1efa18c50c94"
api_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:8070")
api_key = os.environ.get("PAPERCLIP_API_KEY", "")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

def fetch_and_print_goals():
    print("--- Goals ---")
    try:
        response = requests.get(f"{api_url}/api/companies/{company_id}/goals", headers=headers, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        print(json.dumps(data, indent=2, ensure_ascii=False))

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from response.")

fetch_and_print_goals()
