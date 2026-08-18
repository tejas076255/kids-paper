import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dialer from './components/Dialer'
import Metrics from './components/Metrics'
import FeedbackFeed from './components/FeedbackFeed'
import FeedbackModal from './components/FeedbackModal'
import { useCalls } from './hooks/useCalls'
import './index.css'

function App() {
  const {
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
  } = useCalls()

  const [selectedCall, setSelectedCall] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const exportData = () => {
    if (calls.length === 0) {
      alert('No customer call data to export.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(calls, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `kids_paper_feedback_${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  }

  return (
    <>
      {/* Glowing Background Orbs */}
      <div className="glow-orb orb-1"></div>
      <div className="glow-orb orb-2"></div>
      <div className="glow-orb orb-3"></div>

      <div className="main-wrapper">
        <Sidebar 
          config={config} 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
        />

        <div className="workspace">
          <Header 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            syncCalls={syncCalls}
            exportData={exportData}
            clearStorage={clearStorage}
            onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          />

          <div className="workspace-body">
            <section id="dialer" className="dialer-section">
              <Dialer makeCall={makeCall} />
              <Metrics calls={calls} />
            </section>

            <FeedbackFeed 
              filteredCalls={filteredCalls}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onOpenModal={setSelectedCall}
            />
          </div>
        </div>
      </div>

      <FeedbackModal 
        call={selectedCall} 
        onClose={() => setSelectedCall(null)}
        saveNotes={saveNotes}
      />
    </>
  )
}

export default App
