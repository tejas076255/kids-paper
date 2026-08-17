import React, { useState } from 'react';

export default function Dialer({ makeCall }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleCall = async () => {
    if (!phone || phone.length < 6) {
      alert('Please enter a valid phone number (e.g. +91 9876543210 or +1 3642239842)');
      return;
    }

    setLoading(true);
    setNotice({ type: 'info', text: `Connecting call to ${phone}...` });

    const result = await makeCall(phone, name);

    if (result.success) {
      setNotice({ type: 'success', text: `SUCCESS! Call dispatched to ${phone}. When finished, the summary will save in LocalStorage.` });
      setPhone('');
      setName('');
    } else {
      setNotice({ type: 'error', text: `FAILED: ${result.error}` });
    }
    
    setLoading(false);
  };

  return (
    <>
      <div className="dialer-card">
        <div className="card-badge"><i className="fa-solid fa-tower-cell"></i> Live Outbound Calling</div>
        <h2>Call Kids Paper Reader / Parent</h2>
        <p>Directly trigger a phone call via Twilio. Kids Voice Assistant will speak in Hindi, English, Gujarati, or Marathi and collect feedback into your browser storage.</p>

        <div className="dialer-inputs">
          <div className="input-wrapper">
            <label><i className="fa-solid fa-phone"></i> Customer Phone Number</label>
            <input 
              type="text" 
              placeholder="e.g. +919876543210 or +13642239842" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required 
            />
          </div>

          <div className="input-wrapper">
            <label><i className="fa-solid fa-user"></i> Parent / Reader Name</label>
            <input 
              type="text" 
              placeholder="e.g. Tejas / Parent Name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <button className="dial-submit-btn" onClick={handleCall} disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-phone-volume"></i>}
            <span>{loading ? 'Dialling Customer...' : 'Call Customer Now'}</span>
          </button>
        </div>

        {notice && (
          <div className={`call-status-notice ${notice.type === 'success' ? 'notice-success' : notice.type === 'error' ? 'notice-error' : ''}`}>
            {notice.text}
          </div>
        )}
      </div>
    </>
  );
}
