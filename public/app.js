/**
 * Kids Paper AI Call Center - Application Logic
 * Triggers Outbound Calls via Vapi REST API & Stores Reader Feedback in LocalStorage
 */

class KidsPaperHub {
  constructor() {
    this.storageKey = 'kids_paper_call_feedback';
    this.calls = [];
    this.filteredCalls = [];
    this.selectedCallId = null;
    this.config = {};

    this.init();
  }

  async init() {
    this.loadFromLocalStorage();
    await this.fetchConfig();
    this.renderKPIs();
    this.renderSummaries();

    // Auto sync calls on load
    this.syncCalls();

    // Poll for webhooks every 8 seconds
    setInterval(() => this.pollWebhooks(), 8000);
  }

  // --- System Configuration ---
  async fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        this.config = await res.json();
        if (this.config.phoneNumber) {
          document.getElementById('twilioLine').textContent = this.config.phoneNumber;
        }
        if (this.config.assistantId) {
          document.getElementById('assistantName').textContent = 'kids voice assitance';
        }
      }
    } catch (e) {
      console.warn('Failed to load system config:', e);
    }
  }

  // --- Outbound Call Trigger ---
  async makeCall() {
    const phoneInput = document.getElementById('phoneInput');
    const nameInput = document.getElementById('nameInput');
    const btn = document.getElementById('dialBtn');
    const notice = document.getElementById('callNotice');

    const phone = phoneInput.value.trim();
    const name = nameInput.value.trim();

    if (!phone || phone.length < 6) {
      alert('Please enter a valid phone number (e.g. +91 9876543210 or +1 3642239842)');
      return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Dialling Customer...';
    btn.disabled = true;

    notice.classList.remove('hidden', 'notice-success', 'notice-error');
    notice.textContent = `Connecting call to ${phone}...`;

    try {
      const res = await fetch('/api/call/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: phone,
          customerName: name || 'Reader Parent'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        notice.classList.add('notice-success');
        notice.textContent = `SUCCESS! Call dispatched to ${phone}. When finished, the summary will save in LocalStorage.`;

        // Add transient item to local storage
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

        this.calls.unshift(pendingCall);
        this.saveToLocalStorage();
        this.filterCalls();
        this.renderKPIs();

        // Clear input
        phoneInput.value = '';
        nameInput.value = '';

        // Auto sync after call finishes
        setTimeout(() => this.syncCalls(), 20000);
        setTimeout(() => this.syncCalls(), 40000);

      } else {
        throw new Error(data.details || data.error || 'Outbound call failed');
      }
    } catch (err) {
      console.error('Outbound Call Error:', err);
      notice.classList.add('notice-error');
      notice.textContent = `FAILED: ${err.message}`;
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }

  // --- LocalStorage Storage Engine ---
  loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        this.calls = JSON.parse(data);
        console.log(`[LocalStorage] Loaded ${this.calls.length} feedback summaries.`);
      }
    } catch (e) {
      console.error('[LocalStorage Error]', e);
      this.calls = [];
    }
    this.filteredCalls = [...this.calls];
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.calls));
    } catch (e) {
      console.error('[LocalStorage Save Error]', e);
    }
  }

  clearStorage() {
    if (confirm('Are you sure you want to clear all stored customer summaries from this browser?')) {
      localStorage.removeItem(this.storageKey);
      this.calls = [];
      this.filteredCalls = [];
      this.renderKPIs();
      this.renderSummaries();
    }
  }

  // --- Sync with Vapi API ---
  async syncCalls() {
    const syncBtn = document.getElementById('syncBtn');
    const originalText = syncBtn.innerHTML;
    syncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';

    try {
      const res = await fetch('/api/calls');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Failed to sync');
      }

      const vapiCalls = await res.json();

      if (Array.isArray(vapiCalls)) {
        vapiCalls.forEach(vCall => {
          const id = vCall.id;
          const existing = this.calls.find(c => c.id === id);

          const summary = vCall.summary || vCall.analysis?.summary || 'Call completed with Kids Assistant.';
          const customerNumber = vCall.customer?.number || vCall.phoneNumber?.number || '+1 (Customer Call)';
          const durationSeconds = vCall.durationSeconds || Math.round(vCall.endedAt ? (new Date(vCall.endedAt) - new Date(vCall.startedAt)) / 1000 : 0);

          if (!existing) {
            this.calls.push({
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
          } else {
            existing.status = vCall.status || existing.status;
            existing.summary = summary;
            if (vCall.transcript) existing.transcript = vCall.transcript;
            if (vCall.recordingUrl) existing.recordingUrl = vCall.recordingUrl;
            if (durationSeconds > 0) existing.durationSeconds = durationSeconds;
          }
        });

        // Sort newest first
        this.calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        this.saveToLocalStorage();
        this.filterCalls();
        this.renderKPIs();
      }
    } catch (e) {
      console.error('[Sync Error]', e);
    } finally {
      syncBtn.innerHTML = originalText;
    }
  }

  async pollWebhooks() {
    try {
      const res = await fetch('/api/webhooks/latest');
      if (res.ok) {
        const webhooks = await res.json();
        let added = false;
        webhooks.forEach(wh => {
          const existing = this.calls.find(c => c.id === wh.id);
          if (!existing) {
            this.calls.unshift({
              ...wh,
              notes: '',
              savedAt: new Date().toISOString()
            });
            added = true;
          } else {
            existing.summary = wh.summary || existing.summary;
            existing.transcript = wh.transcript || existing.transcript;
            existing.status = wh.status || existing.status;
          }
        });
        if (added) {
          this.saveToLocalStorage();
          this.filterCalls();
          this.renderKPIs();
        }
      }
    } catch (e) {
      // silent
    }
  }

  // --- Filtering & Search ---
  filterCalls() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const status = document.getElementById('statusFilter').value;

    this.filteredCalls = this.calls.filter(call => {
      const matchesQuery = !query || 
        call.customerNumber.toLowerCase().includes(query) ||
        call.summary.toLowerCase().includes(query) ||
        (call.notes && call.notes.toLowerCase().includes(query));

      const matchesStatus = status === 'all' || call.status === status || (status === 'ended' && call.status === 'completed');

      return matchesQuery && matchesStatus;
    });

    this.renderSummaries();
  }

  // --- Rendering ---
  renderKPIs() {
    document.getElementById('kpiTotalCalls').textContent = this.calls.length;
    document.getElementById('kpiSummaries').textContent = this.calls.filter(c => c.summary && c.summary.length > 5).length;

    const totalSec = this.calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
    const mins = Math.round(totalSec / 60);
    document.getElementById('kpiTotalDuration').textContent = `${mins}m ${totalSec % 60}s`;
  }

  renderSummaries() {
    const gridContainer = document.getElementById('summariesGrid');
    const resultsCount = document.getElementById('resultsCount');
    resultsCount.textContent = `${this.filteredCalls.length} Items`;

    if (this.filteredCalls.length === 0) {
      gridContainer.innerHTML = `
        <div class="empty-feed">
          <i class="fa-solid fa-newspaper"></i>
          <h3>No Feedback Summaries Yet</h3>
          <p>Enter a phone number in the Outbound Dialer above and click <strong>Call Customer Now</strong>!</p>
        </div>`;
      return;
    }

    gridContainer.innerHTML = this.filteredCalls.map(call => {
      const dateStr = new Date(call.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const durationStr = `${call.durationSeconds || 0}s`;
      const statusClass = call.status === 'ended' || call.status === 'completed' ? 'pill' : 'pill font-mono';

      return `
        <div class="feedback-card-item">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div class="card-phone">${this.escapeHtml(call.customerNumber)}</div>
                <div class="card-time">${dateStr}</div>
              </div>
              <span class="${statusClass}">${call.status || 'ended'}</span>
            </div>

            <div class="card-summary-snippet">
              ${this.escapeHtml(call.summary || 'Call initiated.')}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:12px;">
            <span style="font-size:0.78rem; color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ${durationStr}</span>
            <button class="action-btn secondary btn-sm" onclick="app.openModal('${call.id}')">
              <i class="fa-solid fa-expand"></i> View Details
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // --- Modal Drawer ---
  openModal(callId) {
    const call = this.calls.find(c => c.id === callId);
    if (!call) return;

    this.selectedCallId = callId;
    document.getElementById('modalCustomerNumber').textContent = call.customerNumber;
    document.getElementById('modalCallDate').textContent = new Date(call.createdAt).toLocaleString();
    document.getElementById('modalDuration').innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${call.durationSeconds || 0}s`;
    document.getElementById('modalEndedReason').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${call.endedReason || 'Completed'}`;
    document.getElementById('modalCallId').innerHTML = `<i class="fa-solid fa-hashtag"></i> ${call.id.substring(0, 12)}...`;

    document.getElementById('modalSummaryContent').textContent = call.summary || 'No summary available.';
    document.getElementById('modalNotesInput').value = call.notes || '';

    // Recording Player
    const recContainer = document.getElementById('modalRecordingContainer');
    const audioPlayer = document.getElementById('modalAudioPlayer');
    if (call.recordingUrl) {
      audioPlayer.src = call.recordingUrl;
      recContainer.classList.remove('hidden');
    } else {
      recContainer.classList.add('hidden');
      audioPlayer.src = '';
    }

    // Transcript Timeline
    const transcriptTimeline = document.getElementById('modalTranscriptTimeline');
    if (call.transcript) {
      const lines = call.transcript.split('\n').filter(l => l.trim().length > 0);
      transcriptTimeline.innerHTML = lines.map(line => {
        const isUser = line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('caller:');
        const role = isUser ? 'chat-user' : 'chat-assistant';
        return `<div class="chat-bubble ${role}">${this.escapeHtml(line)}</div>`;
      }).join('');
    } else {
      transcriptTimeline.innerHTML = `<p class="text-muted">No transcript recording recorded for this session.</p>`;
    }

    document.getElementById('detailModal').classList.remove('hidden');
  }

  closeModal() {
    document.getElementById('detailModal').classList.add('hidden');
    const audioPlayer = document.getElementById('modalAudioPlayer');
    if (audioPlayer) audioPlayer.pause();
    this.selectedCallId = null;
  }

  saveNotes() {
    if (!this.selectedCallId) return;
    const call = this.calls.find(c => c.id === this.selectedCallId);
    if (call) {
      call.notes = document.getElementById('modalNotesInput').value.trim();
      this.saveToLocalStorage();
      this.filterCalls();
      alert('Customer notes saved to browser LocalStorage!');
    }
  }

  copyCurrentSummary() {
    if (!this.selectedCallId) return;
    const call = this.calls.find(c => c.id === this.selectedCallId);
    if (call) {
      const textToCopy = `Customer: ${call.customerNumber}\nDate: ${new Date(call.createdAt).toLocaleString()}\nSummary: ${call.summary}\nNotes: ${call.notes || 'None'}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert('Summary copied to clipboard!');
      });
    }
  }

  exportData() {
    if (this.calls.length === 0) {
      alert('No customer call data to export.');
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.calls, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `kids_paper_feedback_${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global instance
const app = new KidsPaperHub();
