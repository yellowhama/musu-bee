
import os
import requests
import json
from datetime import datetime, timezone, timedelta

api_url = os.environ.get("PAPERCLIP_API_URL", "http://localhost:8070")
api_key = os.environ.get("PAPERCLIP_API_KEY", "")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

STALE_THRESHOLD = timedelta(hours=1)

def get_running_tasks():
    try:
        response = requests.get(f"{api_url}/api/tasks?status=running", headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error getting running tasks: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")
        return []
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from response.")
        return []

def cancel_task(task_id):
    try:
        response = requests.post(f"{api_url}/api/tasks/{task_id}/cancel", headers=headers, timeout=30)
        response.raise_for_status()
        print(f"Task {task_id} cancelled successfully.")
    except requests.exceptions.RequestException as e:
        print(f"Error cancelling task {task_id}: {e}")
        if e.response is not None:
            print(f"Response content: {e.response.text}")

def main():
    running_tasks = get_running_tasks()
    now = datetime.now(timezone.utc)

    for task in running_tasks:
        created_at_str = task.get("created_at")
        if created_at_str:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            if now - created_at > STALE_THRESHOLD:
                print(f"Task {task['task_id']} is stale. Cancelling...")
                cancel_task(task['task_id'])

if __name__ == "__main__":
    main()
