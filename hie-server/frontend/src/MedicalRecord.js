import React, { useState, useEffect } from "react";
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getHospitalInfo(user) {
  if (!user || !user.email) return { name: "", address: "" };
  if (user.hospital === "A병원" || user.email.endsWith("@abc.com"))
    return { name: "A병원", address: "서울시 종로구 대학로 1" };
  if (user.hospital === "B병원" || user.email.endsWith("@bac.com"))
    return { name: "B병원", address: "서울시 강남구 강남대로 2" };
  return { name: "기타병원", address: "" };
}

// 질병명-코드 매핑 테이블 (확장됨)
const diseaseCodeMap = {
  // 감염성 질환
  "감기": "J00", "독감": "J11.1", "인플루엔자": "J11.1", "급성기관지염": "J20.9", "폐렴": "J18.9",
  
  // 소화기 질환
  "급성장염": "K59.1", "장염": "K59.1", "위염": "K29.7", "급성위염": "K29.0", "만성위염": "K29.5",
  "위궤양": "K25.9", "십이지장궤양": "K26.9", "식중독": "K59.1", "복통": "R10.4", "설사": "K59.1",
  "변비": "K59.0", "소화불량": "K30", "위장관염": "K52.9",
  
  // 알레르기/호흡기
  "알레르기비염": "J30.4", "천식": "J45.9", "기관지천식": "J45.9", "알레르기": "T78.4",
  "두드러기": "L50.9", "아토피": "L20.9", "비염": "J31.0", "기침": "R05", "콧물": "R09.8",
  
  // 근골격계
  "요통": "M54.5", "목디스크": "M50.2", "허리디스크": "M51.2", "어깨결림": "M25.5",
  "관절염": "M19.9", "골절": "T14.2", "근육통": "M79.1", "목통증": "M54.2",
  
  // 신경계/정신과
  "두통": "R51", "편두통": "G43.9", "어지럼증": "R42", "불면증": "G47.0",
  "우울증": "F32.9", "불안장애": "F41.9", "스트레스": "Z73.3",
  
  // 피부과
  "습진": "L30.9", "무좀": "B35.3", "여드름": "L70.0", "건선": "L40.9", "피부염": "L25.9",
  
  // 비뇨기과
  "방광염": "N30.9", "신우신염": "N10", "요로감염": "N39.0",
  
  // 안과/이비인후과
  "결막염": "H10.9", "중이염": "H66.9", "외이염": "H60.9", "인후염": "J02.9", "편도염": "J03.9",
  
  // 기타 흔한 질환
  "고혈압": "I10", "당뇨병": "E11.9", "빈혈": "D64.9", "발열": "R50.9", "피로": "R53"
};

// 자주 사용하는 진료과 목록
const departments = [
  "내과", "외과", "소아과", "산부인과", "정형외과", "피부과", "안과", "이비인후과",
  "신경과", "정신건강의학과", "비뇨의학과", "흉부외과", "신경외과", "성형외과",
  "재활의학과", "응급의학과", "가정의학과", "마취통증의학과"
];

// 자주 사용하는 주소 패턴
const addressSuggestions = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원도", "충청북도", "충청남도",
  "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도"
];

// 진단명으로 질병코드 찾기
function findDiseaseCode(diagnosis) {
  if (!diagnosis) return "";
  const cleanDiagnosis = diagnosis.trim().toLowerCase();
  
  for (const [disease, code] of Object.entries(diseaseCodeMap)) {
    if (disease === cleanDiagnosis || cleanDiagnosis.includes(disease) || disease.includes(cleanDiagnosis)) {
      return code;
    }
  }
  return "";
}

// 자동완성 제안 목록 생성
function getSuggestions(input, type = 'diagnosis') {
  if (!input || input.length < 1) return [];
  
  const cleanInput = input.trim().toLowerCase();
  let suggestions = [];
  
  if (type === 'diagnosis') {
    for (const disease of Object.keys(diseaseCodeMap)) {
      if (disease.includes(cleanInput) || cleanInput.includes(disease)) {
        suggestions.push({ disease, code: diseaseCodeMap[disease] });
      }
    }
  } else if (type === 'department') {
    suggestions = departments.filter(dept => 
      dept.includes(cleanInput) || cleanInput.includes(dept)
    ).map(dept => ({ text: dept }));
  } else if (type === 'address') {
    suggestions = addressSuggestions.filter(addr => 
      addr.includes(cleanInput) || cleanInput.includes(addr)
    ).map(addr => ({ text: addr }));
  }
  
  return suggestions.slice(0, 8);
}

// 주민번호 자동 포맷팅
function formatSSN(value) {
  const numbers = value.replace(/[^\d]/g, '');
  if (numbers.length <= 6) return numbers;
  return numbers.slice(0, 6) + '-' + numbers.slice(6, 13);
}

// 환자번호 자동 생성
function generatePatientNo() {
  const today = new Date();
  const year = today.getFullYear().toString().slice(-2);
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `${year}${month}${random}`;
}

function MedicalDocument() {
  const [form, setForm] = useState({
    patient_no: "",
    name: "",
    gender: "",
    ssn: "",
    address: "",
    department: "",
    disease_code: "",
    diagnosis: "",
    visit_start: getToday(),
    visit_end: getToday(),
    description: "",
    note: "",
  });
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState('');
  const [activeField, setActiveField] = useState('');

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      visit_start: getToday(),
      visit_end: getToday(),
    }));
  }, []);

  if (!user) return <div style={{ padding: 40 }}>로그인 정보 없음</div>;

  const hospitalInfo = getHospitalInfo(user);

  const handleInput = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    // 주민번호 자동 포맷팅
    if (name === 'ssn') {
      processedValue = formatSSN(value);
    }
    
    setForm({ ...form, [name]: processedValue });
    
    // 자동완성 처리
    if (name === 'diagnosis') {
      const autoCode = findDiseaseCode(value);
      setForm(prev => ({ 
        ...prev, 
        [name]: processedValue,
        disease_code: autoCode || prev.disease_code 
      }));
      
      const newSuggestions = getSuggestions(value, 'diagnosis');
      setSuggestions(newSuggestions);
      setShowSuggestions(value.length > 0 && newSuggestions.length > 0);
      setSuggestionType('diagnosis');
      setActiveField(name);
    } else if (name === 'department') {
      const newSuggestions = getSuggestions(value, 'department');
      setSuggestions(newSuggestions);
      setShowSuggestions(value.length > 0 && newSuggestions.length > 0);
      setSuggestionType('department');
      setActiveField(name);
    } else if (name === 'address') {
      const newSuggestions = getSuggestions(value, 'address');
      setSuggestions(newSuggestions);
      setShowSuggestions(value.length > 0 && newSuggestions.length > 0);
      setSuggestionType('address');
      setActiveField(name);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    if (suggestionType === 'diagnosis') {
      setForm(prev => ({
        ...prev,
        diagnosis: suggestion.disease,
        disease_code: suggestion.code
      }));
    } else if (suggestionType === 'department') {
      setForm(prev => ({ ...prev, department: suggestion.text }));
    } else if (suggestionType === 'address') {
      setForm(prev => ({ ...prev, address: suggestion.text }));
    }
    setShowSuggestions(false);
  };

  // 빠른 입력 버튼들
  const handleQuickInput = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // 환자번호 자동 생성
  const handleGeneratePatientNo = () => {
    setForm(prev => ({ ...prev, patient_no: generatePatientNo() }));
  };

  // 폼 초기화
  const handleReset = () => {
    setForm({
      patient_no: "",
      name: "",
      gender: "",
      ssn: "",
      address: "",
      department: "",
      disease_code: "",
      diagnosis: "",
      visit_start: getToday(),
      visit_end: getToday(),
      description: "",
      note: "",
    });
    setMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      doctor_name: user.doctorname || user.name || "",
      hospital: hospitalInfo.name,
      hospital_address: hospitalInfo.address,
      issue_date: getToday(),
    };
    try {
      const res = await fetch(`${BACKEND_URL}/api/medical-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMsg("진료확인서가 등록되었습니다.");
        // 성공시 폼 초기화 (선택사항)
        // handleReset();
      } else {
        setMsg("등록 실패(서버 오류)");
      }
    } catch {
      setMsg("등록 실패(네트워크 오류)");
    }
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div style={{
      width: "100vw",
      minHeight: "100vh",
      background: "#fff",
      fontFamily: "Noto Sans KR, sans-serif",
      padding: "36px 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      {/* 빠른 도구 모음 */}
      <div style={{
        width: 793,
        marginBottom: 16,
        padding: "12px 16px",
        background: "#f8f9fa",
        borderRadius: 8,
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: 14
      }}>
        <span style={{ fontWeight: 600, color: "#495057" }}>빠른 도구:</span>
        <button type="button" onClick={handleGeneratePatientNo} style={quickBtnStyle}>
          환자번호 생성
        </button>
        <button type="button" onClick={() => handleQuickInput('gender', '남')} style={quickBtnStyle}>
          남성
        </button>
        <button type="button" onClick={() => handleQuickInput('gender', '여')} style={quickBtnStyle}>
          여성
        </button>
        <button type="button" onClick={() => handleQuickInput('visit_end', getToday())} style={quickBtnStyle}>
          오늘까지
        </button>
        <button type="button" onClick={handleReset} style={{...quickBtnStyle, background: "#fff2f2", color: "#dc3545"}}>
          초기화
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{
        width: 793,
        minHeight: 1122,
        background: "#fff",
        border: "2px solid #222",
        boxSizing: "border-box",
        padding: "44px 36px 30px 36px",
        position: "relative"
      }}>
        <h2 style={{
          textAlign: "center",
          marginBottom: 38,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 4,
          color: "#222",
        }}>
          진&nbsp;료&nbsp;서
        </h2>
        
        {/* 기본 정보 */}
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: 10,
          fontSize: 16,
          tableLayout: "fixed",
        }}>
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={cellTitle}>등록번호</td>
              <td style={cellBody}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    name="patient_no"
                    value={form.patient_no}
                    onChange={handleInput}
                    style={{...inputCell, width: "70%"}}
                    maxLength={20}
                  />
                  <button type="button" onClick={handleGeneratePatientNo} style={miniBtn}>
                    생성
                  </button>
                </div>
              </td>
              <td style={cellTitle}>성명</td>
              <td style={cellBody}>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleInput}
                  style={inputCell}
                  maxLength={12}
                />
              </td>
              <td style={cellTitle}>성별</td>
              <td style={cellBody}>
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    name="gender"
                    value={form.gender}
                    onChange={handleInput}
                    style={{...inputCell, width: "50%"}}
                    maxLength={3}
                  />
                  <button type="button" onClick={() => handleQuickInput('gender', '남')} style={miniBtn}>남</button>
                  <button type="button" onClick={() => handleQuickInput('gender', '여')} style={miniBtn}>여</button>
                </div>
              </td>
            </tr>
            <tr>
              <td style={cellTitle}>주민번호</td>
              <td style={cellBody}>
                <input
                  name="ssn"
                  value={form.ssn}
                  onChange={handleInput}
                  style={inputCell}
                  maxLength={14}
                  placeholder="자동 포맷팅됩니다"
                />
              </td>
              <td style={cellTitle}>진료과</td>
              <td style={{...cellBody, position: "relative"}}>
                <input
                  name="department"
                  value={form.department}
                  onChange={handleInput}
                  onFocus={() => {
                    const newSuggestions = getSuggestions(form.department, 'department');
                    setSuggestions(newSuggestions);
                    setShowSuggestions(newSuggestions.length > 0);
                    setSuggestionType('department');
                    setActiveField('department');
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  style={inputCell}
                  maxLength={15}
                  placeholder="자동완성 지원"
                />
              </td>
              <td style={cellTitle}>주소</td>
              <td style={{...cellBody, position: "relative"}}>
                <input
                  name="address"
                  value={form.address}
                  onChange={handleInput}
                  onFocus={() => {
                    const newSuggestions = getSuggestions(form.address, 'address');
                    setSuggestions(newSuggestions);
                    setShowSuggestions(newSuggestions.length > 0);
                    setSuggestionType('address');
                    setActiveField('address');
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  style={inputCell}
                  maxLength={40}
                  placeholder="지역 자동완성"
                />
              </td>
            </tr>
          </tbody>
        </table>
        
        {/* 진단명/코드/진료기간 */}
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: 10,
          fontSize: 16,
          tableLayout: "fixed",
        }}>
          <tbody>
            <tr>
              <td style={cellTitle}>진단명</td>
              <td style={{ ...cellBody, width: "57%", position: "relative" }}>
                <input
                  name="diagnosis"
                  value={form.diagnosis}
                  onChange={handleInput}
                  onFocus={() => {
                    if (suggestions.length > 0 && suggestionType === 'diagnosis') setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  style={{ ...inputCell, width: "97%" }}
                  maxLength={50}
                  placeholder="입력하면 질병코드 자동설정"
                  autoComplete="off"
                />
              </td>
              <td style={cellTitle}>질병코드</td>
              <td style={cellBody}>
                <input
                  name="disease_code"
                  value={form.disease_code}
                  onChange={handleInput}
                  style={inputCell}
                  maxLength={10}
                  placeholder="자동설정됨"
                />
              </td>
            </tr>
            <tr>
              <td style={cellTitle}>진료기간</td>
              <td colSpan={3} style={cellBody}>
                <input
                  type="date"
                  name="visit_start"
                  value={form.visit_start}
                  onChange={handleInput}
                  style={{ ...inputCell, width: 140, marginRight: 7 }}
                />{" "}
                ~{" "}
                <input
                  type="date"
                  name="visit_end"
                  value={form.visit_end}
                  onChange={handleInput}
                  style={{ ...inputCell, width: 140, marginLeft: 7 }}
                />
                <button 
                  type="button" 
                  onClick={() => handleQuickInput('visit_end', getToday())} 
                  style={{...miniBtn, marginLeft: 8}}
                >
                  오늘
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 자동완성 드롭다운 */}
        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: "absolute",
            top: activeField === 'diagnosis' ? "420px" : 
                 activeField === 'department' ? "380px" : "380px",
            left: activeField === 'diagnosis' ? "150px" : 
                  activeField === 'department' ? "380px" : "580px",
            width: activeField === 'diagnosis' ? "300px" : "150px",
            background: "#fff",
            border: "1px solid #ccc",
            maxHeight: "200px",
            overflowY: "auto",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            borderRadius: "4px"
          }}>
{suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                onClick={() => handleSuggestionClick(suggestion)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderBottom: idx < suggestions.length - 1 ? "1px solid #eee" : "none",
                  fontSize: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f8f9fa";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "#fff";
                }}
              >
                <span>{suggestionType === 'diagnosis' ? suggestion.disease : suggestion.text}</span>
                {suggestionType === 'diagnosis' && (
                  <span style={{ color: "#6c757d", fontSize: "12px", fontFamily: "monospace" }}>
                    {suggestion.code}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 도움말 */}
        <div style={{
          fontSize: "12px",
          color: "#6c757d",
          marginBottom: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>💡 진단명, 진료과, 주소는 자동완성을 지원합니다</span>
          <span>🔧 빠른 도구를 활용해보세요</span>
        </div>
        
        {/* 진료내용/특이사항 */}
        <div style={{
          border: "1.3px solid #222",
          padding: "14px 14px 22px 14px",
          minHeight: 90,
          marginBottom: 8,
        }}>
          <div style={{ 
            fontWeight: 600, 
            marginBottom: 8, 
            fontSize: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>진&nbsp;료&nbsp;내&nbsp;용</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button 
                type="button" 
                onClick={() => setForm(prev => ({...prev, description: prev.description + "환자는 "}))}
                style={textHelperBtn}
              >
                환자는
              </button>
              <button 
                type="button" 
                onClick={() => setForm(prev => ({...prev, description: prev.description + "증상을 호소하였으며, "}))}
                style={textHelperBtn}
              >
                증상호소
              </button>
              <button 
                type="button" 
                onClick={() => setForm(prev => ({...prev, description: prev.description + "약물 치료를 시행함. "}))}
                style={textHelperBtn}
              >
                약물치료
              </button>
            </div>
          </div>
          <textarea
            name="description"
            value={form.description}
            onChange={handleInput}
            style={{
              width: "100%",
              minHeight: 80,
              maxHeight: 150,
              fontSize: 16,
              border: "none",
              outline: "none",
              background: "none",
              resize: "vertical",
              lineHeight: 1.6,
            }}
            placeholder="진단 결과, 증상, 의사 소견 등 자유기재 (위 버튼으로 빠른 입력 가능)"
            required
          />
        </div>
        
        <div style={{
          border: "1.3px solid #222",
          borderTop: "none",
          padding: "10px 14px 18px 14px",
          minHeight: 44,
          marginBottom: 20,
        }}>
          <div style={{ 
            fontWeight: 600, 
            marginBottom: 6, 
            fontSize: 15,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>특기사항</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button 
                type="button" 
                onClick={() => setForm(prev => ({...prev, note: "특이사항 없음"}))}
                style={textHelperBtn}
              >
                특이사항없음
              </button>
              <button 
                type="button" 
                onClick={() => setForm(prev => ({...prev, note: "지속적인 관찰 필요"}))}
                style={textHelperBtn}
              >
                관찰필요
              </button>
            </div>
          </div>
          <input
            name="note"
            value={form.note}
            onChange={handleInput}
            style={{ ...inputCell, width: "99%" }}
            placeholder="(특이사항 있을 경우 작성)"
            maxLength={50}
          />
        </div>
        
        {/* 의료기관 정보, 의사, 발급일자 */}
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 16,
          marginBottom: 10,
          tableLayout: "fixed",
        }}>
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={cellTitle}>의료기관명</td>
              <td style={cellBody}>{hospitalInfo.name}</td>
              <td style={cellTitle}>발급일자</td>
              <td style={cellBody}>{getToday()}</td>
            </tr>
            <tr>
              <td style={cellTitle}>기관주소</td>
              <td style={cellBody} colSpan={3}>
                {hospitalInfo.address}
              </td>
            </tr>
            <tr>
              <td style={cellTitle}>진료과</td>
              <td style={cellBody}>{form.department}</td>
              <td style={cellTitle}>담당의</td>
              <td style={cellBody}>{user.doctorname}</td>
            </tr>
          </tbody>
        </table>

        {/* 키보드 단축키 안내 */}
        <div style={{
          fontSize: "11px",
          color: "#adb5bd",
          marginTop: 16,
          marginBottom: 16,
          textAlign: "center",
          padding: "8px",
          background: "#f8f9fa",
          borderRadius: "4px"
        }}>
          💡 <strong>단축키:</strong> Ctrl+Enter로 저장 | Tab으로 필드 이동 | 주민번호는 숫자만 입력하면 자동 포맷팅
        </div>
        
        <div style={{
          width: "100%",
          textAlign: "center",
          marginTop: 20,
          display: "flex",
          gap: 12,
          justifyContent: "center"
        }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: "10px 30px",
              background: "#fff",
              color: "#6c757d",
              fontSize: 16,
              border: "2px solid #6c757d",
              borderRadius: 4,
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            초기화
          </button>
          <button
            type="submit"
            style={{
              padding: "10px 60px",
              background: "#fff",
              color: "#111",
              fontSize: 19,
              border: "2.5px solid #111",
              borderRadius: 0,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: 2,
            }}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key === 'Enter') {
                handleSubmit(e);
              }
            }}
          >
            진료확인서 등록
          </button>
        </div>
        
        {msg && (
          <div style={{
            textAlign: "center",
            color: msg.includes("등록되었습니다") ? "#28a745" : "#dc3545",
            marginTop: 18,
            fontWeight: "bold",
            fontSize: 16,
            padding: "8px 16px",
            background: msg.includes("등록되었습니다") ? "#d4edda" : "#f8d7da",
            borderRadius: "4px",
            border: `1px solid ${msg.includes("등록되었습니다") ? "#c3e6cb" : "#f5c6cb"}`
          }}>
            {msg}
          </div>
        )}
      </form>

      {/* 사용 통계 (선택사항) */}
      <div style={{
        width: 793,
        marginTop: 16,
        padding: "12px 16px",
        background: "#f8f9fa",
        borderRadius: 8,
        fontSize: 12,
        color: "#6c757d",
        textAlign: "center"
      }}>
        오늘 작성한 진료서: <strong>-</strong>건 | 이번 달: <strong>-</strong>건
        <span style={{ marginLeft: 16 }}>
          💾 자동 저장 기능은 개발 예정입니다
        </span>
      </div>
    </div>
  );
}

// 스타일 정의
const cellTitle = {
  border: "1.3px solid #222",
  background: "#f5f5f5",
  fontWeight: 600,
  padding: "7px 5px",
  textAlign: "center",
  letterSpacing: 1,
};

const cellBody = {
  border: "1.3px solid #222",
  background: "#fff",
  fontWeight: 400,
  padding: "7px 7px",
  textAlign: "left",
  overflow: "hidden"
};

const inputCell = {
  width: "98%",
  padding: "3px 6px",
  fontSize: 16,
  border: "1px solid #bbb",
  borderRadius: 0,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const quickBtnStyle = {
  padding: "4px 8px",
  fontSize: 12,
  border: "1px solid #dee2e6",
  background: "#fff",
  color: "#495057",
  borderRadius: 4,
  cursor: "pointer",
  fontWeight: 500,
  transition: "all 0.2s"
};

const miniBtn = {
  padding: "2px 6px",
  fontSize: 11,
  border: "1px solid #ced4da",
  background: "#f8f9fa",
  color: "#495057",
  borderRadius: 3,
  cursor: "pointer",
  fontWeight: 500
};

const textHelperBtn = {
  padding: "2px 6px",
  fontSize: 10,
  border: "1px solid #e9ecef",
  background: "#f8f9fa",
  color: "#6c757d",
  borderRadius: 3,
  cursor: "pointer",
  fontWeight: 400
};

export default MedicalDocument;