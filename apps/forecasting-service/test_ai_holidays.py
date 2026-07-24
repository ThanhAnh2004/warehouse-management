import requests
import json
import sys

# Force standard output to support UTF-8 encoding
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

def test_forecast():
    product_id = '01111111-1111-1111-1111-111111111111'
    url = f"http://localhost:8004/forecast/{product_id}?days=7"
    
    print("Querying forecast API for Apple iPhone 15 Pro Max...")
    try:
        response = requests.get(url, timeout=5)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("\nAPI Response:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(f"Error Response: {response.text}")
    except Exception as e:
        print(f"Failed to query API: {e}")

if __name__ == "__main__":
    test_forecast()
