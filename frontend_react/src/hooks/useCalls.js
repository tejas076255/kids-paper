import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STORAGE_KEY = 'kids_paper_call_feedback';
const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export function useCalls() {
  const [calls, setCalls] = useState([]);
  const [filteredCalls, setFilteredCalls] = useState([]);
  const [config, setConfig] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Load from LocalStorage
  const loadFromLocalStorage = useCallback(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        setCalls(parsed);
      }
    } catch (e) {
      console.error('[LocalStorage Error]', e);
    }
  }, []);

  const saveToLocalStorage = useCallback((newCalls) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newCalls));
    } catch (e) {
      console.error('[LocalStorage Save Error]', e);
    }
  }, []);

  const clearStorage = useCallback(() => {
    if (window.confirm('Are you sure you want to clear all stored customer summaries from this browser?')) {
      localStorage.removeItem(STORAGE_KEY);
      setCalls([]);
    }
  }, []);

  // Fetch Config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/config`);
      setConfig(res.data);
    } catch (e) {
      console.warn('Failed to load system config:', e);
    }
  }, []);

  // Sync Calls
  const syncCalls = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/calls`);
      const vapiCalls = res.data;

      if (Array.isArray(vapiCalls)) {
        setCalls(prevCalls => {
          let updated = [...prevCalls];
          let changed = false;

          vapiCalls.forEach(vCall => {
            const id = vCall.id;
            const existingIdx = updated.findIndex(c => c.id === id);

            const summary = vCall.summary || vCall.analysis?.summary || 'Call completed with Kids Assistant.';
            const customerNumber = vCall.customer?.number || vCall.phoneNumber?.number || '+1 (Customer Call)';
            const durationSeconds = vCall.durationSeconds || Math.round(vCall.endedAt ? (new Date(vCall.endedAt) - new Date(vCall.startedAt)) / 1000 : 0);

            if (existingIdx === -1) {
              updated.push({
                id: id,
                createdAt: vCall.createdAt || new Date().toISOString(),
                customerNumber: customerNumber,
                durationSeconds: durationSeconds,
                summary: summary,
                transcript: vCall.transcript || '',
                recordingUrl: vCall.recordingUrl || '',
                status: vCall.status || 'ended',
                endedReason: vCall.endedReason || 'completed',
                notes: '',
                savedAt: new Date().toISOString()
              });
              changed = true;
            } else {
              const existing = updated[existingIdx];
              if (
                existing.status !== (vCall.status || existing.status) ||
                existing.summary !== summary ||
                (vCall.transcript && existing.transcript !== vCall.transcript) ||
                (vCall.recordingUrl && existing.recordingUrl !== vCall.recordingUrl) ||
                (durationSeconds > 0 && existing.durationSeconds !== durationSeconds)
              ) {
                updated[existingIdx] = {
                  ...existing,
                  status: vCall.status || existing.status,
                  summary,
                  transcript: vCall.transcript || existing.transcript,
                  recordingUrl: vCall.recordingUrl || existing.recordingUrl,
                  durationSeconds: durationSeconds > 0 ? durationSeconds : existing.durationSeconds
                };
                changed = true;
              }
            }
          });

          if (changed) {
            updated.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            saveToLocalStorage(updated);
            return updated;
          }
          return prevCalls;
        });
      }
    } catch (e) {
      console.error('[Sync Error]', e);
    }
  }, [saveToLocalStorage]);

  // Poll Webhooks
  const pollWebhooks = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/webhooks/latest`);
      const webhooks = res.data;
      if (webhooks && webhooks.length > 0) {
        setCalls(prevCalls => {
          let updated = [...prevCalls];
          let added = false;
          webhooks.forEach(wh => {
            const existingIdx = updated.findIndex(c => c.id === wh.id);
            if (existingIdx === -1) {
              updated.unshift({
                ...wh,
                notes: '',
                savedAt: new Date().toISOString()
              });
              added = true;
            } else {
              updated[existingIdx] = {
                ...updated[existingIdx],
                summary: wh.summary || updated[existingIdx].summary,
                transcript: wh.transcript || updated[existingIdx].transcript,
                status: wh.status || updated[existingIdx].status
              };
              added = true; // Needs saving
            }
          });
          if (added) {
            saveToLocalStorage(updated);
            return updated;
          }
          return prevCalls;
        });
      }
    } catch (e) {
      // silent
    }
  }, [saveToLocalStorage]);

  // Make Outbound Call
  const makeCall = useCallback(async (phone, name) => {
    try {
      const res = await axios.post(`${API_BASE}/api/call/outbound`, {
        customerNumber: phone,
        customerName: name || 'Reader Parent'
      });
      
      const data = res.data;
      if (data.success) {
        const pendingCall = {
          id: data.call?.id || `call_${Date.now()}`,
          createdAt: new Date().toISOString(),
          customerNumber: phone,
          durationSeconds: 0,
          summary: 'Call in progress... AI feedback summary will automatically generate when call completes.',
          transcript: '',
          recordingUrl: '',
          status: 'in-progress',
          endedReason: 'ringing',
          notes: name ? `Parent Name: ${name}` : '',
          savedAt: new Date().toISOString()
        };

        setCalls(prev => {
          const updated = [pendingCall, ...prev];
          saveToLocalStorage(updated);
          return updated;
        });

        // Auto sync after delay
        setTimeout(() => syncCalls(), 20000);
        setTimeout(() => syncCalls(), 40000);

        return { success: true };
      }
    } catch (err) {
      console.error('Outbound Call Error:', err);
      return { success: false, error: err.response?.data?.details || err.message };
    }
  }, [saveToLocalStorage, syncCalls]);

  const saveNotes = useCallback(async (id, notes) => {
    setCalls(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, notes } : c);
      saveToLocalStorage(updated);
      return updated;
    });

    try {
      await axios.post(`${API_BASE}/api/calls/save-notes`, { id, notes });
    } catch (err) {
      console.warn('[Save Notes Error]:', err);
    }
  }, [saveToLocalStorage]);

  // Init and intervals
  useEffect(() => {
    loadFromLocalStorage();
    fetchConfig();
    syncCalls();

    const interval = setInterval(() => {
      pollWebhooks();
    }, 8000);

    return () => clearInterval(interval);
  }, [loadFromLocalStorage, fetchConfig, syncCalls, pollWebhooks]);

  // Filter effect
  useEffect(() => {
    let result = calls;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => 
        c.customerNumber.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => 
        statusFilter === 'ended' ? (c.status === 'ended' || c.status === 'completed') : c.status === statusFilter
      );
    }
    setFilteredCalls(result);
  }, [calls, searchQuery, statusFilter]);

  return {
    calls,
    filteredCalls,
    config,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    makeCall,
    syncCalls,
    clearStorage,
    saveNotes
  };
}
