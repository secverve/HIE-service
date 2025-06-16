import React, { useState, useEffect } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return dateStr;
  }
}

function PatientSearch() {
  const [patientId, setPatientId] = useState('');
  const [birth6, setBirth6] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [unmaskedRecords, setUnmaskedRecords] = useState(new Set());
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // 마스킹 해제 모달 상태
  const [unmaskModal, setUnmaskModal] = useState({
    isOpen: false,
    record: null
  });
  const [unmaskPassword, setUnmaskPassword] = useState('');
  
  // MFA 관련 상태
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaStatus, setMfaStatus] = useState({
    authenticated: false,
    expiresIn: 0
  });
  const [mfaAuthWindow, setMfaAuthWindow] = useState(null);

  // 사용자 정보 가져오기
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setUser(data))
      .catch(err => console.error('사용자 정보 가져오기 실패:', err));
  }, []);

  // URL 파라미터에서 MFA 토큰 확인 (콜백에서 전달된 경우)
  useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const mfaSuccess = urlParams.get('mfa_success');
  
  if (token && mfaSuccess === 'true') {
    setMfaToken(token);
    // checkMfaStatus를 직접 호출하지 않고 토큰만 설정
    // checkMfaStatus는 별도 useEffect에서 mfaToken 변경 시 호출
    
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // 🔧 eslint 경고 무시

  // MFA 상태 확인
  const checkMfaStatus = async (token = mfaToken) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/mfa/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.mfa_authenticated) {
        setMfaStatus({
          authenticated: true,
          expiresIn: data.expires_in,
          user: data.user,
          acr: data.acr
        });
      } else {
        setMfaStatus({ authenticated: false, expiresIn: 0 });
        setMfaToken(null);
      }
    } catch (error) {
      console.error('MFA 상태 확인 오류:', error);
      setMfaStatus({ authenticated: false, expiresIn: 0 });
    }
  };

  // MFA 인증 시작
// MFA 인증 시작
const startMfaAuth = async (action = 'unmask') => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/mfa/auth-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        return_url: window.location.href
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.auth_url) {
      // 새 창에서 MFA 인증 진행
      const authWindow = window.open(
        data.auth_url,
        'mfa-auth',
        'width=450,height=650,' +
        'scrollbars=yes,' +
        'resizable=no,' +
        'menubar=no,' +
        'toolbar=no,' +
        'location=no,' +
        'status=no,' +
        'titlebar=no,' +
        'directories=no,' +
        'copyhistory=no,' +
        'left=' + (window.screen.width / 2 - 225) + ',' +
        'top=' + (window.screen.height / 2 - 325)
      );
      
      setMfaAuthWindow(authWindow);
      
      // PostMessage 수신 대기
      const handleMessage = (event) => {
        if (event.data && event.data.type === 'MFA_SUCCESS') {
          console.log('MFA 인증 성공 메시지 수신:', event.data);
          
          // 토큰 저장
          setMfaToken(event.data.token);
          checkMfaStatus(event.data.token);
          
          // 창 닫기
          if (authWindow && !authWindow.closed) {
            authWindow.close();
          }
          setMfaAuthWindow(null);
          
          // 이벤트 리스너 제거
          window.removeEventListener('message', handleMessage);
          
          alert('MFA 인증이 완료되었습니다!');
        }
      };
      
      // PostMessage 이벤트 리스너 등록
      window.addEventListener('message', handleMessage);
      
      // 기존 창 닫힘 감지 (PostMessage 실패 시 대비)
      const checkAuthComplete = setInterval(() => {
        try {
          if (authWindow.closed) {
            clearInterval(checkAuthComplete);
            setMfaAuthWindow(null);
            window.removeEventListener('message', handleMessage);
            
            // URL 파라미터 확인 (대안적 방법)
            setTimeout(() => {
              const urlParams = new URLSearchParams(window.location.search);
              const token = urlParams.get('token');
              const mfaSuccess = urlParams.get('mfa_success');
              
              if (token && mfaSuccess === 'true') {
                setMfaToken(token);
                checkMfaStatus(token);
                
                // URL에서 파라미터 제거
                const newUrl = window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                
                alert('MFA 인증이 완료되었습니다!');
              }
            }, 1000);
          }
        } catch (e) {
          // Cross-origin 에러 무시
        }
      }, 1000);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('MFA 인증 시작 오류:', error);
    return false;
  }
};

  const setRange = (months, days = 0) => {
    if (months === null && days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }

    const now = new Date();
    let start = new Date();
    if (months > 0) {
      start.setMonth(now.getMonth() - months);
    } else if (days > 0) {
      start.setDate(now.getDate() - days);
    }
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  };

  // 내 병원만 검색
  const handleMyHospitalSearch = async () => {
    if (!user?.hospital) {
      alert('병원 정보를 가져올 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    setLoading(true);
    setUnmaskedRecords(new Set());
    
    let query = {};
    if (patientId) query.patient_id = patientId;
    if (birth6) query.birth6 = birth6;
    if (name) query.name = name;
    if (startDate) query.start_date = startDate;
    if (endDate) query.end_date = endDate;

    try {
      const res = await fetch(`${BACKEND_URL}/api/patient/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('검색 실패');
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      alert(err.message || '에러 발생');
      setRecords([]);
    }
    setLoading(false);
  };

  // 전체 병원 검색 (MFA 필수)
  const handleAllHospitalSearch = async () => {
    // MFA 인증 확인
    if (!mfaStatus.authenticated) {
      const confirmed = window.confirm('전체 병원 조회를 위해서는 추가 인증(OTP)이 필요합니다. 인증을 진행하시겠습니까?');
      if (!confirmed) return;
      
      const authStarted = await startMfaAuth('external_search');
      if (!authStarted) {
        alert('인증을 시작할 수 없습니다. 다시 시도해주세요.');
      }
      return;
    }

    setLoading(true);
    setUnmaskedRecords(new Set());
    
    let query = { includeExternal: true };
    if (patientId) query.patient_id = patientId;
    if (birth6) query.birth6 = birth6;
    if (name) query.name = name;
    if (startDate) query.start_date = startDate;
    if (endDate) query.end_date = endDate;

    console.log('[DEBUG] 전체 병원 조회 요청 데이터:', query);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // MFA 토큰이 있으면 Authorization 헤더에 추가
      if (mfaToken) {
        headers['Authorization'] = `Bearer ${mfaToken}`;
      }
      
      const res = await fetch(`${BACKEND_URL}/api/patient/search`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(query),
        credentials: 'include',
      });
      
      console.log('[DEBUG] 응답 상태:', res.status);
      
      if (res.status === 401 || res.status === 403) {
        const errorData = await res.json();
        if (errorData.code === 'MFA_REQUIRED_EXTERNAL' || errorData.code === 'MFA_VERIFICATION_FAILED') {
          alert('MFA 인증이 만료되었습니다. 다시 인증해주세요.');
          setMfaToken(null);
          setMfaStatus({ authenticated: false, expiresIn: 0 });
          return;
        }
      }
      
      if (!res.ok) throw new Error('검색 실패');
      const data = await res.json();
      
      console.log('[DEBUG] 응답 데이터:', data);
      
      setRecords(data.records || []);
    } catch (err) {
      console.error('[DEBUG] 에러:', err);
      alert(err.message || '에러 발생');
      setRecords([]);
    }
    setLoading(false);
  };

  // 마스킹 해제 함수 (MFA 필수)
  const handleUnmask = async () => {
    // MFA 인증 확인
    if (!mfaStatus.authenticated) {
      const confirmed = window.confirm('개인정보 마스킹 해제를 위해서는 추가 인증(OTP)이 필요합니다. 인증을 진행하시겠습니까?');
      if (!confirmed) return;
      
      const authStarted = await startMfaAuth('unmask');
      if (!authStarted) {
        alert('인증을 시작할 수 없습니다. 다시 시도해주세요.');
      }
      return;
    }

    if (!unmaskPassword) {
      alert('비밀번호를 입력해주세요.');
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // MFA 토큰을 Authorization 헤더에 추가
      if (mfaToken) {
        headers['Authorization'] = `Bearer ${mfaToken}`;
      }
      
      const res = await fetch(`${BACKEND_URL}/api/patient/unmask`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          record_id: unmaskModal.record.id,
          fields: ['name', 'address', 'disease_code', 'diagnosis', 'description'],
          verification_password: unmaskPassword
        }),
        credentials: 'include',
      });

      if (res.status === 401 || res.status === 403) {
        const errorData = await res.json();
        if (errorData.code === 'MFA_TOKEN_MISSING' || errorData.code === 'MFA_TOKEN_INVALID') {
          alert('MFA 인증이 만료되었습니다. 다시 인증해주세요.');
          setMfaToken(null);
          setMfaStatus({ authenticated: false, expiresIn: 0 });
          return;
        }
      }

      if (!res.ok) throw new Error('마스킹 해제 실패');
      const data = await res.json();

      console.log('[DEBUG] 마스킹 해제 응답:', data);

      // 레코드 업데이트
      setRecords(prevRecords => 
        prevRecords.map(record => {
          if (record.id === unmaskModal.record.id) {
            return {
              ...record,
              name: data.unmasked_data?.name || record.name,
              address: data.unmasked_data?.address || record.address,
              disease_code: data.unmasked_data?.disease_code || record.disease_code,
              diagnosis: data.unmasked_data?.diagnosis || record.diagnosis,
              description: data.unmasked_data?.description || record.description
            };
          }
          return record;
        })
      );

      // 마스킹 해제된 레코드로 표시
      setUnmaskedRecords(prev => new Set([...prev, unmaskModal.record.id]));
      
      // 모달 닫기 및 상태 초기화
      setUnmaskModal({ isOpen: false, record: null });
      setUnmaskPassword('');
      
      alert('마스킹이 해제되었습니다.');

    } catch (err) {
      console.error('[DEBUG] 마스킹 해제 에러:', err);
      alert(err.message || '마스킹 해제 실패');
    }
  };

  // 진료서 상세보기
  const handleViewDetail = (record) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  // MFA 세션 만료 시간 포맷팅
  const formatMfaExpiry = (expiresIn) => {
    if (expiresIn <= 0) return '만료됨';
    const minutes = Math.floor(expiresIn / 60);
    const seconds = expiresIn % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 마스킹 해제 모달 컴포넌트 (MFA 방식으로 변경)
  const UnmaskModal = () => {
    if (!unmaskModal.isOpen || !unmaskModal.record) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000
      }}>
        <div style={{
          background: '#fff',
          padding: '24px',
          borderRadius: 12,
          width: 450,
          maxWidth: '90vw'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            color: '#dc3545',
            textAlign: 'center'
          }}>
            🔓 개인정보 마스킹 해제
          </h3>
          
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              <strong>환자:</strong> {unmaskModal.record.name}
            </p>
            <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>
              <strong>병원:</strong> {unmaskModal.record.hospital}
            </p>
            
            {/* MFA 인증 상태 표시 */}
            {mfaStatus.authenticated ? (
              <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#28a745' }}>
                ✅ MFA 인증됨 (남은 시간: {formatMfaExpiry(mfaStatus.expiresIn)})
              </p>
            ) : (
              <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#dc3545' }}>
                ❌ MFA 인증 필요 - 인증 버튼을 눌러주세요
              </p>
            )}
            
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#856404' }}>
              이 작업은 보안 로그에 기록됩니다.
            </p>
          </div>
          
          {/* MFA 인증 버튼 (인증되지 않은 경우) */}
          {!mfaStatus.authenticated && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <button
                onClick={() => startMfaAuth('unmask')}
                style={{
                  padding: '12px 24px',
                  background: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🔐 MFA 인증하기 (OTP)
              </button>
              <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                새 창에서 Keycloak OTP 인증을 진행합니다
              </div>
            </div>
          )}
          
          {/* 비밀번호 입력 (MFA 인증된 경우에만) */}
          {mfaStatus.authenticated && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                비밀번호 확인:
              </label>
              <input
                type="password"
                value={unmaskPassword}
                onChange={(e) => setUnmaskPassword(e.target.value)}
                placeholder="현재 로그인 비밀번호"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 14
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleUnmask();
                  }
                }}
              />
            </div>
          )}
          
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            justifyContent: 'flex-end' 
          }}>
            <button
              onClick={() => {
                setUnmaskModal({ isOpen: false, record: null });
                setUnmaskPassword('');
              }}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                background: '#fff',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              취소
            </button>
            <button
              onClick={handleUnmask}
              disabled={!mfaStatus.authenticated || !unmaskPassword}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: (!mfaStatus.authenticated || !unmaskPassword) ? '#ccc' : '#dc3545',
                color: '#fff',
                borderRadius: 4,
                cursor: (!mfaStatus.authenticated || !unmaskPassword) ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              마스킹 해제
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 진료서 상세보기 모달 컴포넌트
  const DetailModal = () => {
    if (!selectedRecord) return null;

    const isUnmasked = unmaskedRecords.has(selectedRecord.id);

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          background: '#fff',
          padding: '32px',
          borderRadius: 12,
          width: 600,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            borderBottom: '2px solid #2976d3',
            paddingBottom: 12
          }}>
            <h3 style={{ 
              margin: 0, 
              color: '#2976d3',
              fontSize: 24,
              fontWeight: 700
            }}>
              진료확인서 상세정보
            </h3>
            <button
              onClick={() => setShowDetailModal(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ✕
            </button>
          </div>

          {/* 환자 기본정보 */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: '#2976d3',
              fontSize: 18,
              borderLeft: '4px solid #2976d3',
              paddingLeft: 8
            }}>
              환자 정보
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={detailLabelStyle}>환자번호</td>
                  <td style={detailValueStyle}>{selectedRecord.patient_no}</td>
                  <td style={detailLabelStyle}>성명</td>
                  <td style={detailValueStyle}>
                    {isUnmasked ? selectedRecord.name : selectedRecord.name}
                  </td>
                </tr>
                <tr>
                  <td style={detailLabelStyle}>성별</td>
                  <td style={detailValueStyle}>{selectedRecord.gender}</td>
                  <td style={detailLabelStyle}>생년월일</td>
                  <td style={detailValueStyle}>{selectedRecord.ssn?.substr(0, 6) || ''}</td>
                </tr>
                <tr>
                  <td style={detailLabelStyle}>주소</td>
                  <td style={detailValueStyle} colSpan={3}>
                    {isUnmasked ? selectedRecord.address : selectedRecord.address}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 진료 정보 */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: '#2976d3',
              fontSize: 18,
              borderLeft: '4px solid #2976d3',
              paddingLeft: 8
            }}>
              진료 정보
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={detailLabelStyle}>진료과</td>
                  <td style={detailValueStyle}>{selectedRecord.department}</td>
                  <td style={detailLabelStyle}>담당의</td>
                  <td style={detailValueStyle}>{selectedRecord.doctor_name}</td>
                </tr>
                <tr>
                  <td style={detailLabelStyle}>진단명</td>
                  <td style={detailValueStyle}>
                    {isUnmasked ? selectedRecord.diagnosis : '[****]'}
                  </td>
                  <td style={detailLabelStyle}>질병코드</td>
                  <td style={detailValueStyle}>
                    {isUnmasked ? selectedRecord.disease_code : '***'}
                  </td>
                </tr>
                <tr>
                  <td style={detailLabelStyle}>진료기간</td>
                  <td style={detailValueStyle} colSpan={3}>
                    {formatDate(selectedRecord.visit_start)} ~ {formatDate(selectedRecord.visit_end)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 진료 내용 */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: '#2976d3',
              fontSize: 18,
              borderLeft: '4px solid #2976d3',
              paddingLeft: 8
            }}>
              진료 내용
            </h4>
            <div style={{
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: 16,
              background: '#f8f9fa',
              minHeight: 80,
              fontSize: 15,
              lineHeight: 1.6
            }}>
              {isUnmasked ? 
                (selectedRecord.description || '진료 내용이 없습니다.') : 
                '[마스킹됨 - 해제 버튼을 눌러주세요]'
              }
            </div>
          </div>

          {/* 의료기관 정보 */}
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ 
              margin: '0 0 12px 0', 
              color: '#2976d3',
              fontSize: 18,
              borderLeft: '4px solid #2976d3',
              paddingLeft: 8
            }}>
              의료기관 정보
            </h4>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={detailLabelStyle}>의료기관명</td>
                  <td style={detailValueStyle}>{selectedRecord.hospital}</td>
                  <td style={detailLabelStyle}>발급일자</td>
                  <td style={detailValueStyle}>{formatDate(selectedRecord.issue_date)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 마스킹 해제 버튼 */}
          {!isUnmasked && (
            <div style={{
              marginBottom: 16,
              textAlign: 'center',
              padding: '12px',
              background: '#fff3cd',
              borderRadius: 6,
              border: '1px solid #ffeaa7'
            }}>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setUnmaskModal({ isOpen: true, record: selectedRecord });
                }}
                style={{
                  padding: '8px 16px',
                  background: '#dc3545',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                🔓 개인정보 마스킹 해제
              </button>
              <div style={{ fontSize: 12, color: '#856404', marginTop: 8 }}>
                 마스킹 해제 시 MFA 인증 및 모든 활동이 로그에 기록됩니다.
              </div>
            </div>
          )}

          {/* 버튼 영역 */}
          <div style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #eee'
          }}>
            <button
              onClick={() => setShowDetailModal(false)}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                background: '#fff',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              닫기
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: '#2976d3',
                color: '#fff',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              🖨️ 인쇄
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      maxWidth: 900,
      margin: '40px auto',
      padding: '32px 28px',
      background: '#fafdff',
      borderRadius: 18,
      boxShadow: '0 4px 24px 0 rgba(30, 50, 90, 0.07), 0 1.5px 5px 0 rgba(40,120,210,0.03)',
      border: '1.5px solid #d0e2fc'
    }}>
      <h2 style={{
        marginBottom: 22,
        textAlign: 'center',
        fontWeight: 700,
        color: '#2976d3',
        letterSpacing: 1.1
      }}>환자 진료기록 조회</h2>

      {user?.hospital && (
        <div style={{
          marginBottom: 16,
          padding: '8px 12px',
          background: '#e8f4fd',
          borderRadius: 6,
          fontSize: 14,
          color: '#2976d3',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}>
          <span>현재 로그인:</span>
          <strong>{user.hospital}</strong>
          <span>-</span>
          <strong>{user.doctorname}</strong>
          
          {/* MFA 상태 표시 */}
          {mfaStatus.authenticated && (
            <>
              <span style={{ marginLeft: 16, color: '#28a745', fontSize: 12 }}>
                🔐 MFA 인증됨 ({formatMfaExpiry(mfaStatus.expiresIn)})
              </span>
            </>
          )}
        </div>
      )}

      {/* MFA 상태 알림 패널 */}
      {mfaStatus.authenticated && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: 6,
          fontSize: 13,
          color: '#155724',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <strong>🔐 MFA 인증 활성화</strong>
            <span style={{ marginLeft: 8 }}>
              타 병원 조회 및 마스킹 해제가 가능합니다 (남은 시간: {formatMfaExpiry(mfaStatus.expiresIn)})
            </span>
          </div>
          <button
            onClick={() => {
              setMfaToken(null);
              setMfaStatus({ authenticated: false, expiresIn: 0 });
            }}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #155724',
              borderRadius: 4,
              color: '#155724',
              fontSize: 11,
              cursor: 'pointer'
            }}
          >
            세션 종료
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 74 }}>환자번호</span>
          <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="환자번호" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 74 }}>이름</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="환자명" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 74 }}>생년월일</span>
          <input type="text" value={birth6} onChange={e => setBirth6(e.target.value)} placeholder="예: 990626" maxLength={6} style={inputStyle} />
          <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>(주민번호 앞 6자리)</span>
        </div>
      </div>

      <div style={{
        margin: '16px 0 8px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ minWidth: 68 }}>조회 기간</span>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 15, color: '#bbb' }}>~</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
      </div>

      {/* 기간 설정 버튼들 */}
      <div style={{
        margin: '10px 0 16px 0',
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        <button onClick={() => setRange(0, 7)} style={quickBtnStyle}>최근 1주</button>
        <button onClick={() => setRange(1)} style={quickBtnStyle}>최근 1개월</button>
        <button onClick={() => setRange(3)} style={quickBtnStyle}>최근 3개월</button>
        <button onClick={() => setRange(6)} style={quickBtnStyle}>최근 6개월</button>
        <button onClick={() => setRange(null, null)} style={quickBtnStyle}>전체 기간</button>
      </div>

      <div style={{
        margin: '10px 0 20px 0',
        display: 'flex',
        gap: 7,
        justifyContent: 'center'
      }}>
        <button onClick={handleMyHospitalSearch} disabled={loading || !user?.hospital}
          style={{
            ...btnStyle,
            width: 140,
            background: loading || !user?.hospital ? '#b7d1f1' : '#3174c8',
            color: '#fff',
            cursor: loading || !user?.hospital ? 'not-allowed' : 'pointer'
          }}>
          {loading ? '조회중...' : '내 병원만 조회'}
        </button>
        <button onClick={handleAllHospitalSearch} disabled={loading}
          style={{
            ...btnStyle,
            width: 160,
            background: loading ? '#f8a5b8' : (mfaStatus.authenticated ? '#28a745' : '#f66087'),
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            position: 'relative'
          }}>
          {loading ? '조회중...' : (
            <>
              🔐 전체 병원 조회
              {!mfaStatus.authenticated && (
                <span style={{ 
                  fontSize: 10, 
                  display: 'block', 
                  marginTop: 2,
                  opacity: 0.9 
                }}>
                  (MFA 인증 필요)
                </span>
              )}
            </>
          )}
        </button>
      </div>

      <div style={{
        minHeight: 80,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e5ecf5',
        padding: 12
      }}>
        <div style={{ fontWeight: 700, color: '#3777cc', marginBottom: 9 }}>
          조회 결과 {records.length > 0 && `(${records.length}건)`}
        </div>
        {records.length === 0 ?
          <div style={{ color: '#888', fontSize: 15, textAlign: 'center', padding: '20px 0' }}>
            조회 결과 없음
          </div>
          :
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13
            }}>
              <thead>
                <tr style={{ background: '#eef6ff', color: '#2b4666', fontWeight: 600 }}>
                  <th style={thTd}>이름</th>
                  <th style={thTd}>성별</th>
                  <th style={thTd}>생년월일</th>
                  <th style={thTd}>주소</th>
                  <th style={thTd}>진단코드</th>
                  <th style={thTd}>진료일</th>
                  <th style={thTd}>상세기록</th>
                  <th style={thTd}>병원</th>
                  <th style={thTd}>마스킹해제</th>
                  <th style={thTd}>상세보기</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx} style={{ 
                    borderBottom: '1px solid #f2f5fa',
                    backgroundColor: r.hospital === user?.hospital ? '#f0f8ff' : 'transparent'
                  }}>
                    <td style={thTd}>
                      {unmaskedRecords.has(r.id) ? r.name : r.name}
                    </td>
                    <td style={thTd}>{r.gender}</td>
                    <td style={thTd}>{r.ssn ? r.ssn.substr(0, 6) : ''}</td>
                    <td style={{...thTd, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {unmaskedRecords.has(r.id) ? r.address : r.address}
                    </td>
                    <td style={thTd}>
                      {unmaskedRecords.has(r.id) ? r.disease_code : '***'}
                    </td>
                    <td style={thTd}>{formatDate(r.visit_start)}</td>
                    <td style={{...thTd, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {unmaskedRecords.has(r.id) ? 
                        (r.diagnosis || r.description || '조회불가') : 
                        '[마스킹됨]'
                      }
                    </td>
                    <td style={{
                      ...thTd,
                      fontWeight: r.hospital === user?.hospital ? 'bold' : 'normal',
                      color: r.hospital === user?.hospital ? '#2976d3' : 'inherit'
                    }}>
                      {r.hospital || '-'}
                    </td>
                    <td style={thTd}>
                      {unmaskedRecords.has(r.id) ? (
                        <span style={{ color: '#28a745', fontSize: 11, fontWeight: 'bold' }}>
                          ✓ 해제됨
                        </span>
                      ) : (
                        <button
                          onClick={() => setUnmaskModal({ isOpen: true, record: r })}
                          style={{
                            padding: '3px 6px',
                            fontSize: 10,
                            background: mfaStatus.authenticated ? '#28a745' : '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 3,
                            cursor: 'pointer'
                          }}
                        >
                          {mfaStatus.authenticated ? '🔓 해제' : '🔐 해제'}
                        </button>
                      )}
                    </td>
                    <td style={thTd}>
                      <button
                        onClick={() => handleViewDetail(r)}
                        style={{
                          padding: '3px 6px',
                          fontSize: 10,
                          background: '#17a2b8',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer'
                        }}
                      >
                        📋 상세
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      </div>

      {/* 개인정보 보호 안내 */}
      <div style={{
        marginTop: 16,
        padding: '8px 12px',
        background: '#fff3cd',
        borderRadius: 6,
        fontSize: 12,
        color: '#856404',
        textAlign: 'center'
      }}>
        🔒 개인정보는 마스킹되어 표시됩니다. 타병원 조회 및 마스킹 해제 시 MFA 인증(OTP)이 필요하며 모든 활동이 로그에 기록됩니다.
        {mfaStatus.authenticated && (
          <div style={{ marginTop: 4, color: '#28a745', fontWeight: 'bold' }}>
            현재 MFA 인증 상태로 민감한 작업이 가능합니다.
          </div>
        )}
      </div>

      {/* MFA 인증 창이 열려있을 때 표시 */}
      {mfaAuthWindow && !mfaAuthWindow.closed && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            padding: '32px',
            borderRadius: 12,
            textAlign: 'center',
            maxWidth: 400
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
            <h3 style={{ margin: '0 0 16px 0', color: '#2976d3' }}>
              MFA 인증 진행 중
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#666' }}>
              새 창에서 Keycloak OTP 인증을 완료해주세요.
            </p>
            <div style={{ fontSize: 14, color: '#888' }}>
              인증 완료 후 자동으로 이 창이 닫힙니다.
            </div>
            <button
              onClick={() => {
                if (mfaAuthWindow && !mfaAuthWindow.closed) {
                  mfaAuthWindow.close();
                }
                setMfaAuthWindow(null);
              }}
              style={{
                marginTop: 16,
                padding: '8px 16px',
                background: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 상세보기 모달 */}
      {showDetailModal && <DetailModal />}
      
      {/* 마스킹 해제 모달 */}
      <UnmaskModal />
    </div>
  );
}

// 스타일 정의
const btnStyle = {
  padding: '8px 14px',
  fontSize: 14,
  borderRadius: 7,
  border: '1.2px solid #bdd6f3',
  background: '#eaf3fe',
  color: '#2770b8',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background .13s'
};

const quickBtnStyle = {
  padding: '4px 8px',
  fontSize: 12,
  borderRadius: 4,
  border: '1px solid #d0e2fc',
  background: '#f8fbff',
  color: '#5a8bc4',
  cursor: 'pointer',
  fontWeight: 500
};

const thTd = {
  padding: '8px 6px',
  textAlign: 'center',
  fontSize: 13
};

const inputStyle = {
  flex: 1,
  border: '1.2px solid #b7d1f1',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 15,
  outline: 'none'
};

const detailLabelStyle = {
  padding: '8px 12px',
  background: '#f8f9fa',
  border: '1px solid #dee2e6',
  fontWeight: 600,
  color: '#495057',
  width: '120px',
  fontSize: 14
};

const detailValueStyle = {
  padding: '8px 12px',
  border: '1px solid #dee2e6',
  fontSize: 14,
  color: '#212529'
};

export default PatientSearch;