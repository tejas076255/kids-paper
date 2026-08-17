import React from 'react';

export default function Header({ searchQuery, setSearchQuery, syncCalls, exportData, clearStorage }) {
  return (
    <header className="workspace-header">
      <div className="header-search">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input 
          type="text" 
          placeholder="Search customer phone, parent name, or summary..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="header-actions">
        <button className="action-btn secondary" onClick={syncCalls}>
          <i className="fa-solid fa-rotate"></i> Sync Summaries
        </button>
        <button className="action-btn primary" onClick={exportData}>
          <i className="fa-solid fa-download"></i> Export Data
        </button>
        <button className="action-btn danger" onClick={clearStorage} title="Clear Local Storage">
          <i className="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </header>
  );
}
