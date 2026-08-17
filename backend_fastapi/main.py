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

def upsert_call_to_supabase(call_data: dict):
    if not supabase:
        return None

    num = extract_customer_number(call_data)
    if num == "Customer Call":
        num = call_data.get("customer_number") or call_data.get("customerNumber") or num

    record = {
        "id": call_data.get("id"),
        "created_at": call_data.get("createdAt") or call_data.get("created_at") or datetime.utcnow().isoformat(),
        "customer_number": num,
        "duration_seconds": call_data.get("durationSeconds") or call_data.get("duration_seconds") or 0,
        "summary": call_data.get("summary") or "No summary generated",
        "transcript": call_data.get("transcript") or "",
        "recording_url": call_data.get("recordingUrl") or call_data.get("recording_url") or "",
        "status": call_data.get("status") or "ended",
        "ended_reason": call_data.get("endedReason") or call_data.get("ended_reason") or "completed",
        "notes": call_data.get("notes"),
        "updated_at": datetime.utcnow().isoformat()
    }

    try:
        data, count = supabase.table("calls").upsert(record).execute()
        print(f"[Supabase] Call {record['id']} ({record['customer_number']}) saved/updated successfully.")
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
        
    url = f"https://api.vapi.ai/call?assistantId={VAPI_ASSISTANT_ID}" if VAPI_ASSISTANT_ID else "https://api.vapi.ai/call"
    
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
                summary = v_call.get("summary") or v_call.get("analysis", {}).get("summary", "Call completed with Kids Assistant.")
                
                duration_seconds = v_call.get("durationSeconds")
                if not duration_seconds:
                    if v_call.get("endedAt") and v_call.get("startedAt"):
                        started = datetime.fromisoformat(v_call["startedAt"].replace("Z", "+00:00"))
                        ended = datetime.fromisoformat(v_call["endedAt"].replace("Z", "+00:00"))
                        duration_seconds = round((ended - started).total_seconds())
                    else:
                        duration_seconds = 0
                
                v_call["summary"] = summary
                v_call["durationSeconds"] = duration_seconds
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
        report = {
            "id": call_data.get("id") or f"call_{int(datetime.utcnow().timestamp()*1000)}",
            "createdAt": call_data.get("createdAt") or datetime.utcnow().isoformat(),
            "customerNumber": call_data.get("customer", {}).get("number") or call_data.get("phoneNumber") or "Unknown Customer",
            "durationSeconds": message.get("durationSeconds") or call_data.get("durationSeconds") or 0,
            "summary": message.get("summary") or call_data.get("summary") or "No summary generated",
            "transcript": message.get("transcript") or call_data.get("transcript") or "",
            "recordingUrl": message.get("recordingUrl") or call_data.get("recordingUrl") or "",
            "status": call_data.get("status") or "ended",
            "endedReason": message.get("endedReason") or call_data.get("endedReason") or "completed",
            "analysis": message.get("analysis", {})
        }
        
        webhook_summaries.insert(0, report)
        print(f"[Webhook] Processed call summary for customer: {report['customerNumber']}")
        
        background_tasks.add_task(upsert_call_to_supabase, report)
        
    return {"status": "success"}

@app.get("/api/webhooks/latest")
async def get_latest_webhooks():
    return webhook_summaries
