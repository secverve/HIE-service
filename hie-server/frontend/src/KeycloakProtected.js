import React, { useEffect, useState } from 'react';

export default function KeycloakProtected() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then(res => {
        if (res.status === 401) throw new Error();
        return res.json();
      })
      .then(data => {
        setMessage(data.type === "keycloak"
          ? `Keycloak 인증됨: ${data.info.preferred_username || data.info.email}`
          : '로컬 인증됨');
      })
      .catch(() => {
        setMessage('인증 필요');
      });
  }, []);

  return (
    <div>
      <h2>보호된 페이지</h2>
      <p>{message}</p>
    </div>
  );
}
