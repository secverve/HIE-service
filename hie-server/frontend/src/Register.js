import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';   // 이 부분 추가
import './Login.css';
import logo from './logo.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

function Register() {
  const navigate = useNavigate();   // 이 부분 추가
  const [userType, setUserType] = useState('general');
  const [form, setForm] = useState({
    username: '',
    email: '',
    hospital: '',
    password: ''
  });
  const [msg, setMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    const endpoint = userType === 'general' ? '/api/register' : '/api/keycloak-register';
    const res = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(data.msg || '가입 성공!');
    } else {
      setMsg(data.msg || '가입 실패');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-left">
          <img src={logo} alt="logo" className="login-logo" />
          <div className="login-title">병동 200/OK <br />REGISTER</div>
        </div>
        <div className="login-right">
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => setUserType('general')}
              style={{
                marginRight: 8,
                background: userType === 'general' ? '#007bff' : '#eee',
                color: userType === 'general' ? 'white' : '#222',
                border: 'none', borderRadius: 4, padding: '4px 12px'
              }}
            >일반회원</button>
            <button
              onClick={() => setUserType('keycloak')}
              style={{
                background: userType === 'keycloak' ? '#007bff' : '#eee',
                color: userType === 'keycloak' ? 'white' : '#222',
                border: 'none', borderRadius: 4, padding: '4px 12px'
              }}
            >Keycloak 회원</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>ID</label>
              <input
                required
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="아이디 입력"
              />
            </div>
            <div className="input-group">
              <label>이메일</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="이메일 입력"
              />
            </div>
            <div className="input-group">
              <label>병원명</label>
              <input
                required
                value={form.hospital}
                onChange={e => setForm({ ...form, hospital: e.target.value })}
                placeholder="병원명을 입력하세요 (예: A병원)"
              />
            </div>
            <div className="input-group">
              <label>PASSWORD</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="비밀번호 입력"
              />
            </div>
            <button className="login-btn" style={{ marginTop: 16 }} type="submit">
              회원가입
            </button>
            <div style={{ color: 'red', height: '24px', margin: '8px 0' }}>{msg}</div>
          </form>
          <button
            className="auth-btn"
            style={{ marginTop: 16, width: '100%' }}
            onClick={() => navigate('/login')}
          >
            로그인 화면으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

export default Register;
