import React from "react";
import { Navigate } from "react-router-dom";

// localStorage만으로 인증 체크
function RequireLogin({ children }) {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  if (isLoggedIn) return children;
  return <Navigate to="/login" replace />;
}

export default RequireLogin;
