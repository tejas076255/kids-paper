import React from 'react';

export default function FeedbackFeed({ filteredCalls, setStatusFilter, statusFilter, onOpenModal }) {
  return (
    <section id="feed" className="feedback-feed-section">
      <div className="feed-header">
        <div className="feed-title">
          <h3><i className="fa-solid fa-comments"></i> Reader Feedback Summaries</h3>
          <span>Saved in LocalStorage & state</span>
        </div>
        <div className="feed-controls">
          <select 
            className="filter-select" 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Feedback</option>
            <option value="ended">Completed Calls</option>
            <option value="in-progress">In Progress</option>
            <option value="failed">Failed / Missed</option>
          </select>
          <span className="count-pill">{filteredCalls.length} Items</span>
        </div>
      </div>

      <div className="feedback-grid">
        {filteredCalls.length === 0 ? (
          <div className="empty-feed">
            <i className="fa-solid fa-newspaper"></i>
            <h3>No Feedback Summaries Yet</h3>
            <p>Enter a phone number in the Outbound Dialer above and click <strong>Call Customer Now</strong>!</p>
          </div>
        ) : (
          filteredCalls.map(call => {
            const dateStr = new Date(call.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const durationStr = `${call.durationSeconds || 0}s`;
            const isCompleted = call.status === 'ended' || call.status === 'completed';

            return (
              <div key={call.id} className="feedback-card-item">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="card-phone">{call.customerNumber}</div>
                      <div className="card-time">{dateStr}</div>
                    </div>
                    <span className={`pill ${!isCompleted ? 'font-mono' : ''}`}>{call.status || 'ended'}</span>
                  </div>

                  <div className="card-summary-snippet">
                    {call.summary || 'Call initiated.'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-clock"></i> {durationStr}
                  </span>
                  <button className="action-btn secondary btn-sm" onClick={() => onOpenModal(call)}>
                    <i className="fa-solid fa-expand"></i> View Details
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
