import React from 'react';

export default function Metrics({ calls }) {
  const totalCalls = calls.length;
  const summaries = calls.filter(c => c.summary && c.summary.length > 5).length;
  
  const totalSec = calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
  const mins = Math.round(totalSec / 60);
  const secs = totalSec % 60;

  return (
    <div className="metrics-grid">
      <div className="metric-card cyan">
        <div className="metric-icon"><i className="fa-solid fa-phone-slash"></i></div>
        <div className="metric-data">
          <span className="metric-label">Total Calls</span>
          <h3>{totalCalls}</h3>
        </div>
      </div>

      <div className="metric-card amber">
        <div className="metric-icon"><i className="fa-solid fa-newspaper"></i></div>
        <div className="metric-data">
          <span className="metric-label">Stored Summaries</span>
          <h3>{summaries}</h3>
        </div>
      </div>

      <div className="metric-card purple">
        <div className="metric-icon"><i className="fa-solid fa-stopwatch"></i></div>
        <div className="metric-data">
          <span className="metric-label">Talk Time</span>
          <h3>{mins}m {secs}s</h3>
        </div>
      </div>
    </div>
  );
}
