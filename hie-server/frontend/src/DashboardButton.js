function DashboardButton() {
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Keycloak 인증 필요</h2>
      <a href="http://192.168.0.100:5000/login">
        <button>대시보드 접속하기</button>
      </a>
    </div>
  )
}

export default DashboardButton
