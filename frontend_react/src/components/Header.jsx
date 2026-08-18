import React from 'react';

export default function Header({ 
  searchQuery, 
  setSearchQuery, 
  syncCalls, 
  exportData, 
  clearStorage,
  onToggleSidebar 
}) {
  return (
    <header className="workspace-header">
      <div className="header-top-mobile">
        <button className="mobile-menu-btn" onClick={onToggleSidebar} aria-label="Open navigation menu">
          <i className="fa-solid fa-bars"></i>
        </button>
        <div className="mobile-brand">
          <div className="brand-icon-box-sm">
            <i className="fa-solid fa-newspaper"></i>
          </div>
          <span className="mobile-brand-name">Kids Paper</span>
        </div>
      </div>

      <div className="header-search">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input 
          type="text" 
          placeholder="Search phone number, parent name, or summary..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      <div className="header-actions">
        <button className="action-btn secondary" onClick={syncCalls} title="Sync latest calls & summaries">
          <i className="fa-solid fa-rotate"></i>
          <span className="btn-text">Sync</span>
        </button>
        <button className="action-btn primary" onClick={exportData} title="Export Call Feedback (JSON)">
          <i className="fa-solid fa-download"></i>
          <span className="btn-text">Export</span>
        </button>
        <button className="action-btn danger" onClick={clearStorage} title="Clear Local Storage">
          <i className="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </header>
  );
}
