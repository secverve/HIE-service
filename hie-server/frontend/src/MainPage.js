import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from './logo.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

function MainPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(res => {
        if (res.status === 401) {
          navigate('/login', { replace: true });
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) setUser(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        navigate('/login', { replace: true });
      });
  }, [navigate]);

  const handleAuthPage = () => {
    navigate('/auth');
  };

  const handleAdminLogs = () => {
    navigate('/admin/logs');
  };

  // 로그아웃시 백엔드 세션도 해제
  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('isKeycloak');
    // fetch가 아니라 location.href로 백엔드 로그아웃 URL로 직접 이동
    window.location.href = `${BACKEND_URL}/logout`;
  };

  const styles = {
    container: {
      display: 'flex',
      height: '100vh',
      fontFamily: 'sans-serif',
    },
    leftPanel: {
      width: '35%',
      backgroundColor: '#002B5B',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: '180px',
      marginBottom: '20px',
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      textAlign: 'center',
      lineHeight: '1.4',
    },
    rightPanel: {
      width: '65%',
      backgroundColor: '#F6F6F6',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonGrid: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width: '300px',
    },
    authBtn: {
      backgroundColor: '#28A745',
      color: 'white',
      padding: '16px',
      fontSize: '16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: '0.2s ease-in-out',
    },
    adminBtn: {
      backgroundColor: '#DC3545',
      color: 'white',
      padding: '16px',
      fontSize: '16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: '0.2s ease-in-out',
      position: 'relative',
    },
    logoutBtn: {
      backgroundColor: '#6C757D',
      color: 'white',
      padding: '16px',
      fontSize: '16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: '0.2s ease-in-out',
    },
    adminBadge: {
      position: 'absolute',
      top: '-8px',
      right: '-8px',
      backgroundColor: '#FFC107',
      color: '#000',
      fontSize: '12px',
      padding: '4px 8px',
      borderRadius: '12px',
      fontWeight: 'bold',
    },
    userInfo: {
      textAlign: 'center',
      marginBottom: '30px',
    },
    userName: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#333',
      marginBottom: '10px',
    },
    userRole: {
      fontSize: '14px',
      color: '#666',
      backgroundColor: '#E9ECEF',
      padding: '6px 12px',
      borderRadius: '16px',
      display: 'inline-block',
    },
    adminRole: {
      backgroundColor: '#FFE6E6',
      color: '#DC3545',
      fontWeight: 'bold',
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.container, alignItems: "center", justifyContent: "center" }}>
        <div>로딩중...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.leftPanel}>
        <img src={logo} alt="병동 200/OK" style={styles.logo} />
        <div style={styles.title}>
          병동 200 / OK<br />메인페이지
        </div>
      </div>
      <div style={styles.rightPanel}>
        <div style={styles.userInfo}>
          <div style={styles.userName}>
            안녕하세요, {
              user?.doctorname ||
              user?.preferred_username ||
              user?.email ||
              user?.id ||
              '사용자'
            } 님
          </div>
          <div style={{
            ...styles.userRole,
            ...(user?.is_admin ? styles.adminRole : {})
          }}>
            {user?.is_admin ? '🛡️ 시스템 관리자' : 
             user?.is_keycloak ? '🔐 인증 사용자' : '👤 일반 사용자'}
            {user?.hospital && ` | ${user.hospital}`}
          </div>
        </div>

        <div style={styles.buttonGrid}>
          <button
            style={styles.authBtn}
            onClick={handleAuthPage}
          >
            인증 사용자 메뉴
          </button>

          {/* 관리자 전용 버튼 */}
          {user?.is_admin && (
            <button
              style={styles.adminBtn}
              onClick={handleAdminLogs}
            >
              🔐 관리자 로그 조회
              <span style={styles.adminBadge}>ADMIN</span>
            </button>
          )}

          <button
            style={styles.logoutBtn}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>

        
        {user?.is_admin && (
          <div style={{
            marginTop: '30px',
            padding: '15px',
            backgroundColor: '#FFF3CD',
            border: '1px solid #FFEAA7',
            borderRadius: '8px',
            width: '300px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#856404'
          }}>
            <strong>⚠️ 관리자 권한</strong><br />
            시스템 감사 로그 조회가 가능합니다.
          </div>
        )}
      </div>
    </div>
  );
}

export default MainPage;