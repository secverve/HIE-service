import React, { useEffect, useState } from 'react';
import axios from 'axios';

function Dashboard() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    axios.get('/keycloak-protected', { withCredentials: true })
      .then(res => {
        setMessage(res.data.message || 'Keycloak 인증 OK');
      })
      .catch(err => {
        setMessage('Keycloak 인증 필요');
      });
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>Keycloak 보호 대시보드</h2>
      <p>{message}</p>
    </div>
  );
}

export default Dashboard;
