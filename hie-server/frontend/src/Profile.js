import React, { useEffect, useState } from 'react';

// 병원명에 따라 로고 파일 경로 반환
function getHospitalLogo(hospital) {
  if (!hospital) return '/logo.png'; // 기본 로고
  if (hospital === 'A병원') return '/a_logo.png';
  if (hospital === 'B병원') return '/b_logo.png';
  return '/logo.png';
}

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function Profile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data));
  }, []);

  const logoUrl = getHospitalLogo(user?.hospital);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#eaf6ff 0%,#f5fbfa 100%)',
      fontFamily: 'Noto Sans KR, Pretendard, Arial, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 0
    }}>
      <div style={{
        marginTop: 64,
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 4px 32px #0001',
        padding: '48px 54px 38px 54px',
        width: 400,
        maxWidth: '95vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        {/* 병원 로고 출력 */}
        <img src={logoUrl} alt="병원로고"
             style={{
               width: 74, height: 74, objectFit: 'contain',
               marginBottom: 24, borderRadius: 16, boxShadow: '0 2px 8px #0058b022'
             }}/>
        <h2 style={{
          margin: '0 0 30px 0',
          color: '#0452b7',
          fontWeight: 900,
          letterSpacing: 1,
          fontSize: 29,
          textAlign: 'center'
        }}>
          내 프로필
        </h2>
        {user ? (
          <table style={{
            borderCollapse: 'collapse',
            fontSize: 17.5,
            color: '#24304e',
            width: '100%',
            marginBottom: 26,
            background: 'white'
          }}>
            <tbody>
              <tr>
                <td style={{
                  padding: '9px 0', fontWeight: 700, color: '#7e8a96', width: 120,
                  fontSize: 16, letterSpacing: 0.3
                }}>아이디</td>
                <td style={{padding: '9px 0', wordBreak: 'break-all'}}>{user.id}</td>
              </tr>
              <tr>
                <td style={{padding: '9px 0', fontWeight: 700, color: '#7e8a96'}}>이메일</td>
                <td style={{padding: '9px 0'}}>{user.email}</td>
              </tr>
              <tr>
                <td style={{padding: '9px 0', fontWeight: 700, color: '#7e8a96'}}>소속 병원</td>
                <td style={{padding: '9px 0'}}>{user.hospital}</td>
              </tr>
              <tr>
                <td style={{padding: '9px 0', fontWeight: 700, color: '#7e8a96'}}>의사명</td>
                <td style={{padding: '9px 0'}}>{user.doctorname}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{padding: '32px 0', color: '#a44', fontWeight: 700}}>
            사용자 정보 없음<br/>다시 로그인 필요
          </div>
        )}
        {/* Keycloak 인증여부 강조 */}
        <div style={{
          marginTop: 6, fontWeight: 800, fontSize: 20, letterSpacing: 0.5,
          display: 'flex', alignItems: 'center'
        }}>
          Keycloak 인증&nbsp;
          {user && user.is_keycloak ? (
            <span style={{
              color: '#29be46', fontSize: 28, fontWeight: 900,
              marginLeft: 5, letterSpacing: 1.2
            }}>O</span>
          ) : (
            <span style={{
              color: '#eb3636', fontSize: 28, fontWeight: 900,
              marginLeft: 5, letterSpacing: 1.2
            }}>X</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;
