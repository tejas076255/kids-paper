import React from 'react';

export default function Sidebar({ config }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon-box">
          <i className="fa-solid fa-newspaper"></i>
        </div>
        <div className="brand-title">
          <h2>Kids Paper</h2>
          <span>AI Feedback Hub</span>
        </div>
      </div>

      <div className="sidebar-status">
        <div className="status-indicator-box">
          <div className="live-dot"></div>
          <div>
            <small>TWILIO LINE</small>
            <strong>{config.phoneNumber || '+1 (364) 223-9842'}</strong>
          </div>
        </div>

        <div className="assistant-pill-box">
          <i className="fa-solid fa-robot"></i>
          <div>
            <small>VAPI AGENT</small>
            <strong>{config.assistantId ? 'kids voice assitance' : 'Loading...'}</strong>
          </div>
        </div>
      </div>

      <nav className="sidebar-menu">
        <a href="#dialer" className="menu-item active"><i className="fa-solid fa-phone-arrow-up-right"></i> Outbound Dialer</a>
        <a href="#feed" className="menu-item"><i className="fa-solid fa-comments"></i> Reader Feedback</a>
        <a href="#analytics" className="menu-item"><i className="fa-solid fa-chart-pie"></i> Local Storage Data</a>
      </nav>

      <div className="sidebar-footer">
        <div className="storage-badge" style={config.isSupabaseConfigured ? { borderColor: 'rgba(74, 222, 128, 0.4)', color: '#4ade80' } : {}}>
          {config.isSupabaseConfigured ? (
            <><i className="fa-solid fa-cloud-arrow-up"></i> Supabase Active</>
          ) : (
            <><i className="fa-solid fa-database"></i> LocalStorage Active</>
          )}
        </div>
      </div>
    </aside>
  );
}
