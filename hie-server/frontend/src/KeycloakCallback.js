import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

function KeycloakCallback({ setUser }) {
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/me`, { credentials: "include" });
        const data = await res.json();

        if (res.ok && data && data.id) {
          // user 구조 명확화
          const userInfo = {
            email: data.email || "",
            name: data.name || "",
            id: data.id,
            hospital: data.hospital || "",
            doctorname : data.doctorname || "",
            isKeycloak: true
          };
          localStorage.setItem("isLoggedIn", "true");
          localStorage.setItem("isKeycloak", "true");
          localStorage.setItem("user", JSON.stringify(userInfo));
          setUser && setUser(userInfo);
          navigate("/main", { replace: true });
        } else {
          // 인증 실패, 초기화
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("isKeycloak");
          localStorage.removeItem("user");
          setUser && setUser(null);
          navigate("/login", { replace: true });
        }
      } catch (err) {
        // 네트워크/기타 에러도 로그인 실패로 처리
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("isKeycloak");
        localStorage.removeItem("user");
        setUser && setUser(null);
        navigate("/login", { replace: true });
      }
    };

    fetchUserInfo();
  }, [navigate, setUser]);

  return <div style={{ padding: 40 }}>Keycloak 인증 처리중...</div>;
}

export default KeycloakCallback;
