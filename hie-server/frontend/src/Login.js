import React, { useState } from 'react';
import './Login.css';
import logo from './logo.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

function Login({ setUser }) {
  const [userID, setUserID] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [msg, setMsg] = useState('');

  // 일반 로그인
  const handleLogin = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: userID, password: userPassword }),
      });
      const data = await res.json();
      console.log("로그인 응답 데이터:", data);

      if (data.status === 'success' && data.email && data.name) {
        // 사용자 정보 저장
        const userData = {
          email: data.email,
          name: data.name,
          id: data.id,
          doctorname: data.doctorname,
          hospital: data.hospital,
          is_admin: data.is_admin || false,
          is_keycloak: data.is_keycloak || false
        };
        
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        
        // 모든 사용자 메인 페이지로 이동
        window.location.href = '/main';
      } else {
        setMsg('일반 로그인 실패');
      }
    } catch {
      setMsg('서버 오류');
    }
  };

  // Keycloak 연동 로그인
  const handleKeycloakLogin = () => {
    window.location.assign(`${BACKEND_URL}/keycloak-login`);
  };

  // 회원가입 페이지 이동
  const handleRegister = () => {
    window.location.href = '/register';
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-left">
          <img src={logo} alt="logo" className="login-logo" />
          <div className="login-title">병동 200/OK <br />LOGIN</div>
        </div>
        <div className="login-right">
          <div className="input-group">
            <label>ID</label>
            <input
              type="text"
              value={userID}
              onChange={(e) => setUserID(e.target.value)}
              placeholder="아이디 입력"
            />
          </div>
          <div className="input-group">
            <label>PASSWORD</label>
            <input
              type="password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder="비밀번호 입력"
            />
          </div>
          <div className="login-options">
            <label><input type="checkbox" /> Remember User ID</label>
          </div>
          <button className="login-btn" onClick={handleLogin}>일반 로그인</button>
          <button className="auth-btn" onClick={handleKeycloakLogin}>인증 로그인 (Keycloak)</button>
          <div style={{ color: 'red', height: '24px', margin: '8px 0' }}>{msg}</div>
          <div className="login-links">
            <span style={{cursor:'pointer', color:'#007bff'}} onClick={handleRegister}>
              회원가입
            </span>
            <span className="helpdesk">HELP DESK</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;