import os
import sys
import json
import urllib.request
import urllib.error

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

def make_vapi_request(endpoint, method='GET', payload=None, api_key=None):
    url = f"https://api.vapi.ai/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"\n[HTTP Error {e.code}] {e.reason}")
        print(f"Details: {error_body}")
        return None
    except Exception as e:
        print(f"\n[Error]: {str(e)}")
        return None

def main():
    load_env()
    
    vapi_key = os.getenv('VAPI_API_KEY', '').strip()
    twilio_sid = os.getenv('TWILIO_ACCOUNT_SID', '').strip()
    twilio_token = os.getenv('TWILIO_AUTH_TOKEN', '').strip()
    twilio_number = os.getenv('TWILIO_PHONE_NUMBER', '').strip()
    env_assistant_id = os.getenv('VAPI_ASSISTANT_ID', '').strip()
    env_phone_number_id = os.getenv('VAPI_PHONE_NUMBER_ID', '').strip()
    
    if not vapi_key:
        print("ERROR: VAPI_API_KEY is missing in .env file.")
        sys.exit(1)
        
    if not twilio_sid:
        print("ERROR: TWILIO_ACCOUNT_SID is missing in .env file.")
        sys.exit(1)
        
    if not twilio_token:
        print("ERROR: TWILIO_AUTH_TOKEN is missing in .env file.")
        sys.exit(1)
        
    if not twilio_number:
        print("ERROR: TWILIO_PHONE_NUMBER is missing in .env file.")
        sys.exit(1)
        
    assistant_id = None
    assistant_name = "Kids Assistant"
    
    if env_assistant_id:
        print(f"1. Using specified Assistant ID from .env: {env_assistant_id}")
        ast_info = make_vapi_request(f"assistant/{env_assistant_id}", method="GET", api_key=vapi_key)
        if ast_info:
            assistant_id = ast_info.get('id')
            assistant_name = ast_info.get('name', assistant_name)
            print(f"-> Verified Assistant: '{assistant_name}' (ID: {assistant_id})")
        else:
            print("Warning: Could not fetch assistant details by ID, using ID directly.")
            assistant_id = env_assistant_id
    else:
        print("1. Fetching Assistants list from Vapi...")
        assistants = make_vapi_request("assistant", method="GET", api_key=vapi_key)
        if assistants and isinstance(assistants, list) and len(assistants) > 0:
            for ast in assistants:
                if 'kids' in ast.get('name', '').lower():
                    target_assistant = ast
                    break
            else:
                target_assistant = assistants[0]
            assistant_id = target_assistant.get('id')
            assistant_name = target_assistant.get('name', assistant_name)
            print(f"-> Found Assistant: '{assistant_name}' (ID: {assistant_id})")
            
    if not assistant_id:
        print("ERROR: Could not find or set assistant_id.")
        sys.exit(1)
        
    print("\n2. Checking Phone Numbers in Vapi...")
    phone_numbers = make_vapi_request("phone-number", method="GET", api_key=vapi_key)
    
    existing_pn = None
    if isinstance(phone_numbers, list):
        for pn in phone_numbers:
            # Check by number or by ID
            if pn.get('number') == twilio_number or (env_phone_number_id and pn.get('id') == env_phone_number_id):
                existing_pn = pn
                break
                
    if existing_pn:
        pn_id = existing_pn.get('id')
        print(f"-> Phone number found on Vapi (ID: {pn_id}, Current Number: {existing_pn.get('number')}). Updating assistant & Twilio credentials...")
        update_payload = {
            "assistantId": assistant_id,
            "provider": "twilio",
            "number": twilio_number,
            "twilioAccountSid": twilio_sid,
            "twilioAuthToken": twilio_token
        }
        res = make_vapi_request(f"phone-number/{pn_id}", method="PATCH", payload=update_payload, api_key=vapi_key)
        if res:
            print(f"\n========================================================")
            print(f"SUCCESS! Connected Twilio Number {twilio_number} to Assistant '{assistant_name}' ({assistant_id})")
            print(f"========================================================")
        else:
            print("FAILED to update phone number link.")
    else:
        print(f"-> Importing new Twilio Phone Number {twilio_number} to Vapi...")
        import_payload = {
            "provider": "twilio",
            "number": twilio_number,
            "twilioAccountSid": twilio_sid,
            "twilioAuthToken": twilio_token,
            "assistantId": assistant_id,
            "name": f"{assistant_name} Twilio Line"
        }
        res = make_vapi_request("phone-number", method="POST", payload=import_payload, api_key=vapi_key)
        if res:
            new_pn_id = res.get('id')
            print(f"\n========================================================")
            print(f"SUCCESS! Imported Twilio Number {twilio_number} (ID: {new_pn_id})")
            print(f"Connected to Assistant: '{assistant_name}' ({assistant_id})")
            print(f"========================================================")
        else:
            print("FAILED to import Twilio phone number.")

if __name__ == '__main__':
    main()
