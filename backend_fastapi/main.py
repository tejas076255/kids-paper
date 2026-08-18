import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx
from supabase import create_client, Client

env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

app = FastAPI(title="Kids Paper Feedback API")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration & Env Vars
PORT = int(os.getenv("PORT", 8000))
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID", "e07dde59-667f-4376-ba59-40d8eac1225a")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "+13642239842")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "5964e851-bf89-491a-a511-9ab1e340d5a7")
INSTITUTE_NAME = os.getenv("INSTITUTE_NAME", "Kids Paper (Kids Age)")
VAPI_API_KEY = os.getenv("VAPI_API_KEY")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_URL.startswith("http"):
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        print("[Supabase] Client initialized successfully.")
    except Exception as e:
        print(f"[Supabase Init Error]: {e}")
else:
    print("[Supabase] SUPABASE_URL or SUPABASE_ANON_KEY missing in .env. Running in LocalStorage mode.")

webhook_summaries = []

# Helpers
def format_e164(phone: str) -> str:
    if not phone:
        return ""
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if not cleaned.startswith("+"):
        if len(cleaned) == 10:
            cleaned = "+91" + cleaned
        elif len(cleaned) == 11 and cleaned.startswith("0"):
            cleaned = "+91" + cleaned[1:]
        else:
            cleaned = "+" + cleaned
    return cleaned

def extract_customer_number(v_call: dict) -> str:
    if not v_call:
        return "Unknown Customer"
    
    customer = v_call.get("customer", {})
    if isinstance(customer, dict) and customer.get("number"):
        return customer["number"].strip()
    
    if v_call.get("customerNumber"):
        return str(v_call["customerNumber"]).strip()
        
    dest = v_call.get("destination", {})
    if isinstance(dest, dict) and dest.get("number"):
        return dest["number"].strip()
        
    phone = v_call.get("phoneNumber", {})
    if isinstance(phone, dict) and phone.get("number") and v_call.get("type") == "inboundPhoneCall":
        return phone["number"].strip()
        
    if isinstance(customer, str) and customer.strip():
        return customer.strip()
        
    if v_call.get("type") == "webCall":
        return "Web Demo Call"
        
    return "Customer Call"

def extract_recording_url(v_call: dict) -> str:
    if not isinstance(v_call, dict):
        return ""
    artifact = v_call.get("artifact") if isinstance(v_call.get("artifact"), dict) else {}
    
    for val in [
        v_call.get("recordingUrl"),
        artifact.get("recordingUrl"),
        v_call.get("stereoRecordingUrl"),
        artifact.get("stereoRecordingUrl"),
        v_call.get("recording_url")
    ]:
        if val and isinstance(val, str) and val.strip().startswith("http"):
            return val.strip()
    return ""

def extract_transcript(v_call: dict) -> str:
    if not isinstance(v_call, dict):
        return ""
    artifact = v_call.get("artifact") if isinstance(v_call.get("artifact"), dict) else {}
    
    transcript = v_call.get("transcript") or artifact.get("transcript") or v_call.get("transcriptText") or ""
    if isinstance(transcript, str):
        return transcript.strip()
    return ""

def generate_or_extract_summary(v_call: dict, transcript: str, ended_reason: str) -> str:
    artifact = v_call.get("artifact") if isinstance(v_call.get("artifact"), dict) else {}
    analysis = v_call.get("analysis") if isinstance(v_call.get("analysis"), dict) else {}
    
    summary = v_call.get("summary") or analysis.get("summary") or artifact.get("summary") or ""
    if isinstance(summary, str) and summary.strip() and summary.strip() != "Call completed with Kids Assistant.":
        return summary.strip()
        
    # If transcript exists, generate a smart readable summary
    if transcript and transcript.strip():
        lines = [line.strip() for line in transcript.strip().split("\n") if line.strip()]
        user_lines = [l for l in lines if l.lower().startswith("user:") or l.lower().startswith("caller:")]
        if user_lines:
            return "Reader Feedback: " + " | ".join(user_lines[:4])
        else:
            return "Conversation: " + " ".join(lines[:3])
            
    # If no transcript, explain based on endedReason or status
    if ended_reason:
        reason_lower = ended_reason.lower()
        if "busy" in reason_lower:
            return "Customer line busy / Did not answer"
        elif "silence-timed-out" in reason_lower:
            return "Call connected but silence timed out"
        elif "error" in reason_lower:
            return f"Call ended ({ended_reason})"
        elif "customer-ended-call" in reason_lower:
            return "Customer disconnected before speaking"
            
    return "Call completed"

def upsert_call_to_supabase(call_data: dict):
    if not supabase:
        return None

    num = extract_customer_number(call_data)
    if num == "Customer Call":
        num = call_data.get("customer_number") or call_data.get("customerNumber") or num

    recording_url = extract_recording_url(call_data)
    transcript = extract_transcript(call_data)
    ended_reason = call_data.get("endedReason") or call_data.get("ended_reason") or "completed"
    summary = generate_or_extract_summary(call_data, transcript, ended_reason)

    started_at = call_data.get("startedAt")
    ended_at = call_data.get("endedAt")
    duration_seconds = call_data.get("durationSeconds") or call_data.get("duration_seconds")
    if not duration_seconds and started_at and ended_at:
        try:
            s_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            e_dt = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
            duration_seconds = max(0, round((e_dt - s_dt).total_seconds()))
        except Exception:
            duration_seconds = 0
    elif not duration_seconds:
        duration_seconds = 0

    record = {
        "id": call_data.get("id"),
        "created_at": call_data.get("createdAt") or call_data.get("created_at") or datetime.utcnow().isoformat(),
        "customer_number": num,
        "duration_seconds": duration_seconds,
        "summary": summary,
        "transcript": transcript,
        "recording_url": recording_url,
        "status": call_data.get("status") or "ended",
        "ended_reason": ended_reason,
        "notes": call_data.get("notes"),
        "updated_at": datetime.utcnow().isoformat()
    }

    try:
        data, count = supabase.table("calls").upsert(record).execute()
        print(f"[Supabase] Call {record['id']} ({record['customer_number']}) synced: rec={bool(recording_url)}, sum={len(summary)} chars")
        return data
    except Exception as e:
        print(f"[Supabase Error]: {e}")
        return None

# Pydantic Models
class SaveNotesRequest(BaseModel):
    id: str
    notes: str

class OutboundCallRequest(BaseModel):
    customerNumber: str
    customerName: Optional[str] = None

# Routes
@app.get("/api/config")
async def get_config():
    return {
        "assistantId": VAPI_ASSISTANT_ID,
        "phoneNumber": TWILIO_PHONE_NUMBER,
        "phoneNumberId": VAPI_PHONE_NUMBER_ID,
        "instituteName": INSTITUTE_NAME,
        "port": PORT,
        "isConfigured": bool(VAPI_API_KEY and TWILIO_PHONE_NUMBER),
        "isSupabaseConfigured": bool(supabase)
    }

@app.get("/api/calls")
async def get_calls(background_tasks: BackgroundTasks):
    if not VAPI_API_KEY:
        raise HTTPException(status_code=400, detail="VAPI_API_KEY is not configured in .env")
        
    url = f"https://api.vapi.ai/call?assistantId={VAPI_ASSISTANT_ID}&limit=100" if VAPI_ASSISTANT_ID else "https://api.vapi.ai/call?limit=100"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers={
            "Authorization": f"Bearer {VAPI_API_KEY}",
            "User-Agent": "Mozilla/5.0 (FastAPI Backend)"
        })
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
            
        calls = response.json()
        
        if isinstance(calls, list) and supabase:
            for v_call in calls:
                rec_url = extract_recording_url(v_call)
                transcript = extract_transcript(v_call)
                ended_reason = v_call.get("endedReason") or "completed"
                summary = generate_or_extract_summary(v_call, transcript, ended_reason)
                
                v_call["recordingUrl"] = rec_url
                v_call["transcript"] = transcript
                v_call["summary"] = summary
                
                duration_seconds = v_call.get("durationSeconds")
                if not duration_seconds and v_call.get("endedAt") and v_call.get("startedAt"):
                    try:
                        started = datetime.fromisoformat(v_call["startedAt"].replace("Z", "+00:00"))
                        ended = datetime.fromisoformat(v_call["endedAt"].replace("Z", "+00:00"))
                        duration_seconds = max(0, round((ended - started).total_seconds()))
                    except Exception:
                        duration_seconds = 0
                v_call["durationSeconds"] = duration_seconds or 0
                
                background_tasks.add_task(upsert_call_to_supabase, v_call)
                
        return calls

@app.get("/api/supabase/calls")
async def get_supabase_calls():
    if not supabase:
        raise HTTPException(status_code=400, detail="Supabase is not configured in .env")
        
    try:
        result = supabase.table("calls").select("*").order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        print(f"[Supabase Fetch Error]: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/supabase/sync-all")
async def sync_all_vapi_to_supabase():
    """Manually trigger a full backfill/sync of all Vapi calls into Supabase."""
    if not VAPI_API_KEY:
        raise HTTPException(status_code=400, detail="VAPI_API_KEY missing")
    if not supabase:
        raise HTTPException(status_code=400, detail="Supabase is not configured")

    url = "https://api.vapi.ai/call?limit=100"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers={"Authorization": f"Bearer {VAPI_API_KEY}"})
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        vapi_calls = response.json()

    synced_count = 0
    if isinstance(vapi_calls, list):
        for c in vapi_calls:
            res = upsert_call_to_supabase(c)
            if res is not None:
                synced_count += 1

    return {"success": True, "syncedCount": synced_count, "totalFetched": len(vapi_calls)}

@app.post("/api/calls/save-notes")
async def save_notes(req: SaveNotesRequest):
    if supabase:
        try:
            supabase.table("calls").update({
                "notes": req.notes,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", req.id).execute()
            return {"success": True, "message": "Notes saved to Supabase"}
        except Exception as e:
            print(f"[Supabase Update Notes Error]: {e}")
            raise HTTPException(status_code=500, detail=str(e))
            
    return {"success": True, "message": "Notes saved locally (Supabase not active)"}

@app.post("/api/call/outbound")
async def make_outbound_call(req: OutboundCallRequest, background_tasks: BackgroundTasks):
    if not req.customerNumber:
        raise HTTPException(status_code=400, detail="Customer phone number is required")
    if not VAPI_API_KEY:
        raise HTTPException(status_code=400, detail="VAPI_API_KEY is missing")
        
    formatted_number = format_e164(req.customerNumber)
    
    payload = {
        "phoneNumberId": VAPI_PHONE_NUMBER_ID,
        "assistantId": VAPI_ASSISTANT_ID,
        "customer": {
            "number": formatted_number,
            "name": req.customerName or "Valued Reader"
        }
    }
    
    print(f"Initiating Outbound Call to {formatted_number} via Vapi...")
    
    async with httpx.AsyncClient() as client:
        response = await client.post("https://api.vapi.ai/call/phone", json=payload, headers={
            "Authorization": f"Bearer {VAPI_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (FastAPI Backend)"
        })
        
        if response.status_code not in (200, 201):
            err_msg = response.json().get("message") or response.text
            print(f"Outbound Call Failed: {err_msg}")
            raise HTTPException(status_code=400, detail=err_msg)
            
        call_record = response.json()
        print(f"Call Dispatch Success! Call ID: {call_record.get('id')}")
        
        if call_record.get("id") and supabase:
            record_to_save = {
                "id": call_record["id"],
                "createdAt": datetime.utcnow().isoformat(),
                "customerNumber": formatted_number,
                "durationSeconds": 0,
                "summary": "Call in progress...",
                "transcript": "",
                "recordingUrl": "",
                "status": "in-progress",
                "endedReason": "ringing",
                "notes": f"Parent Name: {req.customerName}" if req.customerName else ""
            }
            background_tasks.add_task(upsert_call_to_supabase, record_to_save)
            
        return {"success": True, "formattedNumber": formatted_number, "call": call_record}

@app.post("/api/webhook")
async def vapi_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
        
    message = payload.get("message", {})
    print(f"Received Vapi Webhook Event: {message.get('type', 'Unknown')}")
    
    if message.get("type") == "end-of-call-report":
        call_data = message.get("call", {})
        artifact = message.get("artifact") or call_data.get("artifact") or {}
        
        rec_url = extract_recording_url(message) or extract_recording_url(call_data)
        transcript = extract_transcript(message) or extract_transcript(call_data)
        ended_reason = message.get("endedReason") or call_data.get("endedReason") or "completed"
        summary = generate_or_extract_summary(message, transcript, ended_reason)
        
        report = {
            "id": call_data.get("id") or f"call_{int(datetime.utcnow().timestamp()*1000)}",
            "createdAt": call_data.get("createdAt") or datetime.utcnow().isoformat(),
            "customerNumber": extract_customer_number(call_data),
            "durationSeconds": message.get("durationSeconds") or call_data.get("durationSeconds") or 0,
            "summary": summary,
            "transcript": transcript,
            "recordingUrl": rec_url,
            "status": call_data.get("status") or "ended",
            "endedReason": ended_reason,
            "analysis": message.get("analysis", {})
        }
        
        webhook_summaries.insert(0, report)
        print(f"[Webhook] Processed call summary for customer: {report['customerNumber']}")
        
        background_tasks.add_task(upsert_call_to_supabase, report)
        
    return {"status": "success"}

@app.get("/api/webhooks/latest")
async def get_latest_webhooks():
    return webhook_summaries

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
