import React, { useState, useEffect } from 'react';

export default function FeedbackModal({ call, onClose, saveNotes }) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (call) {
      setNotes(call.notes || '');
    }
  }, [call]);

  if (!call) return null;

  const handleCopy = () => {
    const textToCopy = `Customer: ${call.customerNumber}\nDate: ${new Date(call.createdAt).toLocaleString()}\nSummary: ${call.summary}\nNotes: ${notes || 'None'}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Summary copied to clipboard!');
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="user-detail-header">
            <div className="avatar-lg"><i className="fa-solid fa-user-tie"></i></div>
            <div>
              <h3>{call.customerNumber}</h3>
              <span className="modal-date">{new Date(call.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="modal-body">
          <div className="meta-row">
            <span className="pill"><i className="fa-solid fa-stopwatch"></i> {call.durationSeconds || 0}s</span>
            <span className="pill"><i className="fa-solid fa-circle-check"></i> {call.endedReason || 'Completed'}</span>
            <span className="pill font-mono"><i className="fa-solid fa-hashtag"></i> {call.id.substring(0, 12)}...</span>
          </div>

          {call.recordingUrl && (
            <div className="section-box">
              <h4><i className="fa-solid fa-circle-play"></i> Call Audio Recording</h4>
              <audio controls src={call.recordingUrl} style={{ width: '100%', marginTop: '8px' }}></audio>
            </div>
          )}

          <div className="section-box highlight-box">
            <h4><i className="fa-solid fa-newspaper"></i> AI Reader Feedback Summary</h4>
            <p>{call.summary || 'No summary available.'}</p>
          </div>

          <div className="section-box">
            <h4><i className="fa-solid fa-pen-to-square"></i> Customer Custom Notes (LocalStorage)</h4>
            <textarea 
              rows="3" 
              placeholder="Add custom notes for this parent/customer call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            ></textarea>
            <button 
              className="action-btn primary btn-sm" 
              style={{ marginTop: '8px' }} 
              onClick={() => {
                saveNotes(call.id, notes);
                alert('Notes saved!');
              }}
            >
              Save Notes
            </button>
          </div>

          <div className="section-box">
            <h4><i className="fa-solid fa-comments"></i> Conversation Transcript</h4>
            <div className="transcript-box">
              {call.transcript ? (
                call.transcript.split('\n').filter(l => l.trim().length > 0).map((line, idx) => {
                  const isUser = line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('caller:');
                  return (
                    <div key={idx} className={`chat-bubble ${isUser ? 'chat-user' : 'chat-assistant'}`}>
                      {line}
                    </div>
                  );
                })
              ) : (
                <p className="text-muted" style={{color: 'var(--text-muted)'}}>No transcript recording recorded for this session.</p>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="action-btn secondary" onClick={onClose}>Close</button>
          <button className="action-btn primary" onClick={handleCopy}>Copy Summary</button>
        </div>
      </div>
    </div>
  );
}
