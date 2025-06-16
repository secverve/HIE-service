import React from 'react';
import { useNavigate } from 'react-router-dom';
import logo from './logo.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL

function AuthHome() {
  const navigate = useNavigate();

  const handleProfile = () => {
    navigate('/profile');
  };

  const handleMedicalRecord = () => {
    navigate('/medical-record');
  };

  const handlePatientSearch = () => {
    navigate('/patient-search'); // PatientSearch 컴포넌트 라우팅 경로 맞추기
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('isKeycloak');
    localStorage.removeItem('user');
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
    button: {
      padding: '16px',
      fontSize: '16px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: '0.2s ease-in-out',
    },
    profileBtn: {
      backgroundColor: '#28A745',
      color: 'white',
    },
    medicalRecordBtn: {
      backgroundColor: '#FFB800',
      color: 'white',
    },
    logoutBtn: {
      backgroundColor: '#DC3545',
      color: 'white',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.leftPanel}>
        <img src={logo} alt="병동 200/OK" style={styles.logo} />
        <div style={styles.title}>
          병동 200 / OK<br />통합 인증 홈
        </div>
      </div>
      <div style={styles.rightPanel}>
        <h2>Keycloak 인증 사용자 메뉴</h2>
        <div style={styles.buttonGrid}>
          <button
            style={{ ...styles.button, ...styles.profileBtn }}
            onClick={handleProfile}
          >
            프로필 확인
          </button>
          <button
            style={{ ...styles.button, ...styles.medicalRecordBtn }}
            onClick={handleMedicalRecord}
          >
            진단 기록 입력
          </button>
          <button
            style={{ ...styles.button, backgroundColor: '#2176FF', color: 'white' }}
            onClick={handlePatientSearch}
          >
            환자 정보조회
          </button>
          <button
            style={{ ...styles.button, ...styles.logoutBtn }}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthHome;
