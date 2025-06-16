import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import MainPage from "./MainPage";
import AuthHome from "./AuthHome";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import HospitalInfo from "./HospitalInfo";
import KeycloakCallback from "./KeycloakCallback";
import RequireLogin from "./RequireLogin";
import RequireKeycloakAuth from "./RequireKeycloakAuth";
import MedicalRecord from "./MedicalRecord";
import PatientSearch from "./PatientSearch";
import AdminLogs from "./AdminLogs"; // 관리자 페이지 추가

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        if (data && data.id) {
          setUser(data);
          localStorage.setItem("isLoggedIn", "true");
          if (data.is_keycloak) localStorage.setItem("isKeycloak", "true");
          localStorage.setItem("user", data?.email);
        } else {
          setUser(null);
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("isKeycloak");
        }
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("isKeycloak");
        setLoading(false);
      });
  }, []);

  if (loading) return <div>로딩중...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/register" element={<Register />} />
        
        <Route path="/main" element={
          <RequireLogin user={user}>
            <MainPage user={user} setUser={setUser} />
          </RequireLogin>
        } />
        
        {/* 관리자 로그 페이지 추가 */}
        <Route path="/admin/logs" element={
          user && user.is_admin ? (
            <AdminLogs />
          ) : (
            <Navigate to="/login" />
          )
        } />
        
        <Route path="/auth" element={
          <RequireKeycloakAuth>
            <AuthHome />
          </RequireKeycloakAuth>
        } />
        
        <Route path="/dashboard" element={
          <RequireKeycloakAuth>
            <Dashboard />
          </RequireKeycloakAuth>
        } />
        
        <Route path="/profile" element={
          <RequireKeycloakAuth>
            <Profile />
          </RequireKeycloakAuth>
        } />
        
        <Route path="/hospital" element={
          <RequireKeycloakAuth>
            <HospitalInfo />
          </RequireKeycloakAuth>
        } />
        
        <Route path="/medical-record" element={
          <RequireLogin user={user}>
            <MedicalRecord />
          </RequireLogin>
        } />
        
        <Route path="/patient-search" element={
          <RequireKeycloakAuth>
            <PatientSearch />
          </RequireKeycloakAuth>
        } />
        
        <Route path="/keycloak-callback" element={
          <KeycloakCallback setUser={setUser} />
        } />
        
        <Route path="/" element={<Navigate to="/main" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;