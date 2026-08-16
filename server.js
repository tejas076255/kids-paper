const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory cache of webhooks/realtime end-of-call summaries received
const webhookSummaries = [];

// Helper to sanitize phone number into E.164 format
function formatE164(phone) {
  if (!phone) return '';
  let cleaned = String(phone).trim().replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // Default to +91 for 10-digit Indian numbers if no '+' prefix
    if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      cleaned = '+91' + cleaned.substring(1);
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

// API to get system configuration & status
app.get('/api/config', (req, res) => {
  res.json({
    assistantId: process.env.VAPI_ASSISTANT_ID || 'e07dde59-667f-4376-ba59-40d8eac1225a',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+13642239842',
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID || '5964e851-bf89-491a-a511-9ab1e340d5a7',
    instituteName: process.env.INSTITUTE_NAME || 'Kids Paper (Kids Age)',
    port: PORT,
    isConfigured: !!(process.env.VAPI_API_KEY && process.env.TWILIO_ACCOUNT_SID)
  });
});

// Proxy to fetch calls directly from Vapi API
app.get('/api/calls', async (req, res) => {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'VAPI_API_KEY is not configured in .env' });
  }

  const assistantId = process.env.VAPI_ASSISTANT_ID;

  try {
    const url = assistantId 
      ? `https://api.vapi.ai/call?assistantId=${assistantId}` 
      : 'https://api.vapi.ai/call';

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching calls from Vapi:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch calls from Vapi',
      details: error.response?.data || error.message
    });
  }
});

// Endpoint to trigger outbound call to customer
app.post('/api/call/outbound', async (req, res) => {
  const { customerNumber, customerName } = req.body;
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID || 'e07dde59-667f-4376-ba59-40d8eac1225a';
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || '5964e851-bf89-491a-a511-9ab1e340d5a7';

  if (!customerNumber) {
    return res.status(400).json({ error: 'Customer phone number is required' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'VAPI_API_KEY is missing' });
  }

  const formattedNumber = formatE164(customerNumber);

  try {
    const payload = {
      phoneNumberId: phoneNumberId,
      assistantId: assistantId,
      customer: {
        number: formattedNumber,
        name: customerName || 'Valued Reader'
      }
    };

    console.log(`Initiating Outbound Call to ${formattedNumber} (raw: ${customerNumber}) via Vapi...`);
    const response = await axios.post('https://api.vapi.ai/call/phone', payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    console.log('Call Dispatch Success! Call ID:', response.data?.id);
    res.json({ success: true, formattedNumber: formattedNumber, call: response.data });
  } catch (error) {
    const vapiErrMsg = error.response?.data?.message 
      ? (Array.isArray(error.response.data.message) ? error.response.data.message.join(', ') : error.response.data.message)
      : (error.response?.data?.error || error.message);

    console.error('Outbound Call Failed:', vapiErrMsg);
    res.status(400).json({
      error: 'Failed to initiate call via Vapi',
      details: vapiErrMsg
    });
  }
});

// Vapi Webhook endpoint for end-of-call report
app.post('/api/webhook', (req, res) => {
  const payload = req.body;
  console.log('Received Vapi Webhook Event:', payload?.message?.type || 'Unknown');

  if (payload?.message?.type === 'end-of-call-report') {
    const callData = payload.message.call || {};
    const report = {
      id: callData.id || `call_${Date.now()}`,
      createdAt: callData.createdAt || new Date().toISOString(),
      customerNumber: callData.customer?.number || callData.phoneNumber || 'Unknown Customer',
      durationSeconds: payload.message.durationSeconds || callData.durationSeconds || 0,
      summary: payload.message.summary || callData.summary || 'No summary generated',
      transcript: payload.message.transcript || callData.transcript || '',
      recordingUrl: payload.message.recordingUrl || callData.recordingUrl || '',
      status: callData.status || 'ended',
      endedReason: payload.message.endedReason || callData.endedReason || 'completed',
      analysis: payload.message.analysis || {}
    };

    webhookSummaries.unshift(report);
    console.log(`[Webhook] Processed call summary for customer: ${report.customerNumber}`);
  }

  res.status(200).json({ status: 'success' });
});

// Endpoint to fetch webhooks received since page load
app.get('/api/webhooks/latest', (req, res) => {
  res.json(webhookSummaries);
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Kids Paper Feedback Dashboard running on http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
