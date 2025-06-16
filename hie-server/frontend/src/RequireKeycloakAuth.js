import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

function RequireKeycloakAuth({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/me`, { credentials: "include" })
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (data && data.id && data.is_keycloak) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
        setLoading(false);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>로딩중...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default RequireKeycloakAuth;
