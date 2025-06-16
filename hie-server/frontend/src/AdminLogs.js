import React, { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('ko-KR');
  } catch {
    return dateStr;
  }
}

function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchForm, setSearchForm] = useState({
    action: '',
    user_email: '',
    hospital: '',
    start_date: '',
    end_date: ''
  });

  // 사용자 정보 확인
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setUser(data);
        if (!data.is_admin) {
          alert('관리자 권한이 필요합니다.');
          window.location.href = '/';
        }
      })
      .catch(err => {
        console.error('사용자 정보 가져오기 실패:', err);
        window.location.href = '/';
      });
  }, []);

  // useCallback으로 fetchLogs 함수 정의
  const fetchLogs = useCallback(async (page = 1) => {
    if (!user || !user.is_admin) return;

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/logs?page=${page}&limit=20`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('로그 조회 실패');
      const data = await res.json();
      
      setLogs(data.logs || []);
      setTotalPages(Math.ceil(data.total / data.limit));
      setCurrentPage(page);
    } catch (err) {
      alert(err.message || '로그 조회 실패');
    }
    setLoading(false);
  }, [user]); // user를 의존성으로 추가

  // 로그 검색
  const handleSearch = async () => {
    if (!user || !user.is_admin) return;

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/logs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...searchForm, page: 1, limit: 20 }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('로그 검색 실패');
      const data = await res.json();
      
      setLogs(data.logs || []);
      setTotalPages(Math.ceil(data.total / data.limit));
      setCurrentPage(1);
    } catch (err) {
      alert(err.message || '로그 검색 실패');
    }
    setLoading(false);
  };

  // 초기 로드 - fetchLogs를 의존성에 추가
  useEffect(() => {
    if (user && user.is_admin) {
      fetchLogs(1);
    }
  }, [user, fetchLogs]); // fetchLogs를 의존성에 추가

  if (!user || !user.is_admin) {
    return <div style={{ padding: 40, textAlign: 'center' }}>접근 권한이 없습니다.</div>;
  }

  return (
    <div style={{
      maxWidth: 1200,
      margin: '40px auto',
      padding: '32px 28px',
      background: '#fafdff',
      borderRadius: 18,
      boxShadow: '0 4px 24px 0 rgba(30, 50, 90, 0.07)',
      border: '1.5px solid #d0e2fc'
    }}>
      <h2 style={{
        marginBottom: 22,
        textAlign: 'center',
        fontWeight: 700,
        color: '#dc3545',
        letterSpacing: 1.1
      }}>🔐 관리자 감사 로그</h2>

      {/* 검색 폼 */}
      <div style={{
        background: '#fff',
        padding: '20px',
        borderRadius: 10,
        border: '1px solid #e5ecf5',
        marginBottom: 20
      }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#2976d3' }}>로그 검색</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>액션</label>
            <input
              type="text"
              value={searchForm.action}
              onChange={e => setSearchForm(prev => ({ ...prev, action: e.target.value }))}
              placeholder="예: 진료입력, 조회"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>사용자 이메일</label>
            <input
              type="text"
              value={searchForm.user_email}
              onChange={e => setSearchForm(prev => ({ ...prev, user_email: e.target.value }))}
              placeholder="예: user@abc.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>병원</label>
            <input
              type="text"
              value={searchForm.hospital}
              onChange={e => setSearchForm(prev => ({ ...prev, hospital: e.target.value }))}
              placeholder="예: A병원"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>시작일</label>
            <input
              type="date"
              value={searchForm.start_date}
              onChange={e => setSearchForm(prev => ({ ...prev, start_date: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>종료일</label>
            <input
              type="date"
              value={searchForm.end_date}
              onChange={e => setSearchForm(prev => ({ ...prev, end_date: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <button onClick={handleSearch} disabled={loading} style={{
            ...btnStyle,
            background: '#dc3545',
            color: '#fff',
            height: 40
          }}>
            🔍 검색
          </button>
          <button onClick={() => {
            setSearchForm({ action: '', user_email: '', hospital: '', start_date: '', end_date: '' });
            fetchLogs(1);
          }} style={{
            ...btnStyle,
            background: '#6c757d',
            color: '#fff',
            height: 40
          }}>
            초기화
          </button>
        </div>
      </div>

      {/* 로그 테이블 */}
      <div style={{
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e5ecf5',
        padding: 12
      }}>
        <div style={{ 
          fontWeight: 700, 
          color: '#dc3545', 
          marginBottom: 9,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>감사 로그 {logs.length > 0 && `(${logs.length}건)`}</span>
          <span style={{ fontSize: 12, color: '#666' }}>
            페이지 {currentPage} / {totalPages}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
            로딩 중...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888' }}>
            로그가 없습니다.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13
            }}>
              <thead>
                <tr style={{ background: '#ffe6e6', color: '#721c24', fontWeight: 600 }}>
                  <th style={thTd}>ID</th>
                  <th style={thTd}>액션</th>
                  <th style={thTd}>사용자</th>
                  <th style={thTd}>이름</th>
                  <th style={thTd}>병원</th>
                  <th style={thTd}>상세정보</th>
                  <th style={thTd}>시간</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={idx} style={{ 
                    borderBottom: '1px solid #f2f5fa',
                    backgroundColor: idx % 2 === 0 ? '#fff' : '#fafbfc'
                  }}>
                    <td style={thTd}>{log.id}</td>
                    <td style={{
                      ...thTd,
                      fontWeight: 'bold',
                      color: getActionColor(log.action)
                    }}>
                      {log.action}
                    </td>
                    <td style={thTd}>{log.user_email}</td>
                    <td style={thTd}>{log.user_name}</td>
                    <td style={thTd}>{log.hospital}</td>
                    <td style={{
                      ...thTd,
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 12
                    }}>
                      {log.additional_info}
                    </td>
                    <td style={{...thTd, fontSize: 12}}>
                      {formatDateTime(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 16
          }}>
            <button 
              onClick={() => fetchLogs(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                ...btnStyle,
                background: currentPage === 1 ? '#f8f9fa' : '#6c757d',
                color: currentPage === 1 ? '#6c757d' : '#fff'
              }}
            >
              이전
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, currentPage - 2) + i;
              if (page > totalPages) return null;
              
              return (
                <button
                  key={page}
                  onClick={() => fetchLogs(page)}
                  style={{
                    ...btnStyle,
                    background: page === currentPage ? '#dc3545' : '#6c757d',
                    color: '#fff'
                  }}
                >
                  {page}
                </button>
              );
            })}
            
            <button 
              onClick={() => fetchLogs(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                ...btnStyle,
                background: currentPage === totalPages ? '#f8f9fa' : '#6c757d',
                color: currentPage === totalPages ? '#6c757d' : '#fff'
              }}
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 액션별 색상
function getActionColor(action) {
  if (action.includes('로그인')) return '#28a745';
  if (action.includes('로그아웃')) return '#6c757d';
  if (action.includes('진료입력')) return '#007bff';
  if (action.includes('조회')) return '#17a2b8';
  if (action.includes('마스킹해제')) return '#dc3545';
  if (action.includes('실패') || action.includes('오류')) return '#dc3545';
  return '#495057';
}

// 스타일 정의
const btnStyle = {
  padding: '8px 16px',
  fontSize: 14,
  borderRadius: 4,
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s'
};

const thTd = {
  padding: '8px 6px',
  textAlign: 'center',
  fontSize: 13,
  border: '1px solid #dee2e6'
};

const inputStyle = {
  width: '100%',
  border: '1px solid #ced4da',
  borderRadius: 4,
  padding: '8px 12px',
  fontSize: 14,
  outline: 'none'
};

export default AdminLogs;