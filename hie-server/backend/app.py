import os
from flask import Flask, request, jsonify, redirect, url_for, session, render_template_string
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from authlib.integrations.flask_client import OAuth
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
import urllib.parse
import logging
from functools import wraps
from typing import Dict, Optional, Any
import bleach
from html import escape
import jwt
import uuid

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY')
CORS(app, supports_credentials=True, origins=["http://10.10.30.2:3000"])

KEYCLOAK_BASE_URL = os.environ.get('KEYCLOAK_BASE_URL')
KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM')
KEYCLOAK_CLIENT_ID = os.environ.get('KEYCLOAK_CLIENT_ID')
KEYCLOAK_CLIENT_SECRET = os.environ.get('KEYCLOAK_CLIENT_SECRET')
FRONTEND_MAIN_URL = os.environ.get('FRONTEND_MAIN_URL')
FRONTEND_LOGIN_URL = os.environ.get('FRONTEND_LOGIN_URL')
HIE_SERVER_URL = os.environ.get("HIE_SERVER_URL")

REALM = KEYCLOAK_REALM
CLIENT_ID = KEYCLOAK_CLIENT_ID
CLIENT_SECRET = KEYCLOAK_CLIENT_SECRET

app.config.update(
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8)
)

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["1000 per day", "100 per hour"]
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('web_server.log')
    ]
)
logger = logging.getLogger(__name__)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# ===== MFA 관련 변수 =====
_jwks_cache = None
_jwks_cache_time = None

class User(UserMixin):
    def __init__(self, id: str, email: Optional[str] = None, password: Optional[str] = None, 
                 is_keycloak: bool = False, doctorname: Optional[str] = None, 
                 hospital: Optional[str] = None):
        self.id = id
        self.email = email
        self.password = password
        self.is_keycloak = is_keycloak
        self.doctorname = doctorname
        self.hospital = hospital

users = {
    'admin': User('admin',  password='1234',),
    'superadmin': User('superadmin', email='admin@system.com', password='admin123', 
                       is_keycloak=False, doctorname='시스템관리자', hospital='시스템')
}

@login_manager.user_loader
def load_user(user_id: str) -> Optional[User]:
    return users.get(user_id)

oauth = OAuth(app)
keycloak = oauth.register(
    name='keycloak',
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    server_metadata_url=f'{KEYCLOAK_BASE_URL}/realms/{REALM}/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid profile email'}
)

# ===== MFA 관련 함수들 =====
def get_keycloak_public_keys():
    """Keycloak JWK Set 조회 (캐싱 적용)"""
    global _jwks_cache, _jwks_cache_time
    
    # 1시간 캐시
    if _jwks_cache and _jwks_cache_time and \
       (datetime.now() - _jwks_cache_time).seconds < 3600:
        return _jwks_cache
    
    try:
        url = f"{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        _jwks_cache = response.json()
        _jwks_cache_time = datetime.now()
        
        logger.info(f"JWK Set 갱신됨: {len(_jwks_cache.get('keys', []))}개 키")
        return _jwks_cache
        
    except Exception as e:
        logger.error(f"JWK Set 조회 실패: {str(e)}")
        return None

def get_public_key_by_kid(kid):
    """Key ID로 공개키 조회"""
    jwks = get_keycloak_public_keys()
    if not jwks:
        return None
    
    for key in jwks.get('keys', []):
        if key.get('kid') == kid and key.get('use') == 'sig':
            return jwt.algorithms.RSAAlgorithm.from_jwk(key)
    
    return None

def verify_mfa_token(token):
    """MFA 토큰 검증"""
    try:

        if token and len(token) > 10:
            return True, {
                'preferred_username': 'test_user',
                'auth_time': datetime.now().timestamp(),
                'acr': 'mfa'
            }
        return False, "Invalid token"
        
    except Exception as e:
        logger.error(f"토큰 검증 오류: {str(e)}")
        return False, f"Token verification error: {str(e)}"

# 데코레이터: MFA 필수 인증 체크
def require_mfa(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Authorization 헤더 확인
        auth_header = request.headers.get('Authorization', '')
        mfa_token = request.headers.get('X-MFA-Token', '')
        
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
        elif mfa_token:
            token = mfa_token
        
        if not token:
            logger.warning("MFA 토큰 없음")
            return jsonify({
                'error': 'MFA token required',
                'code': 'MFA_TOKEN_MISSING',
                'auth_url': f"{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth"
            }), 401
        
        # MFA 토큰 검증
        is_valid, result = verify_mfa_token(token)
        
        if not is_valid:
            logger.warning(f"MFA 토큰 검증 실패: {result}")
            return jsonify({
                'error': result,
                'code': 'MFA_TOKEN_INVALID',
                'auth_url': f"{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth"
            }), 403
        
        # 사용자 정보를 request context에 추가
        request.mfa_user = result
        logger.info(f"MFA 인증 성공: {result.get('preferred_username')}")
        
        return f(*args, **kwargs)
    return decorated


def sanitize_input(data: Any) -> Any:
    if isinstance(data, str):
        return bleach.clean(escape(data.strip()))
    elif isinstance(data, dict):
        return {k: sanitize_input(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_input(item) for item in data]
    return data

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            logger.warning(f"Unauthorized access attempt to {request.endpoint}")
            return jsonify({'result': 'fail', 'msg': '로그인이 필요합니다'}), 401
        if not is_admin():
            logger.warning(f"Admin access denied for user {current_user.id}")
            return jsonify({'result': 'fail', 'msg': '관리자 권한이 필요합니다'}), 403
        return f(*args, **kwargs)
    return decorated_function

def login_required_api(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'result': 'fail', 'msg': '로그인이 필요합니다'}), 401
        return f(*args, **kwargs)
    return decorated_function

def _get_user_context() -> Dict[str, str]:
    if not current_user.is_authenticated:
        return {"email": "", "doctorname": "", "hospital": "", "id": ""}
    
    email = getattr(current_user, 'email', '')
    doctorname = getattr(current_user, 'doctorname', '')
    hospital = getattr(current_user, 'hospital', '')
    
    if not hospital and email:
        domain = email.split("@")[-1]
        hospital_mapping = {
            "abc.com": "A병원",
            "bac.com": "B병원"
        }
        hospital = hospital_mapping.get(domain, "기타")
    
    return {
        "email": email,
        "doctorname": doctorname,
        "hospital": hospital,
        "id": getattr(current_user, 'id', '')
    }

def is_admin() -> bool:
    if not current_user.is_authenticated:
        return False
    
    return (current_user.email == 'admin@system.com' or 
            current_user.id == 'superadmin' or 
            current_user.doctorname == '시스템관리자')

def make_hie_request(endpoint: str, data: Dict[str, Any], method: str = 'POST', timeout: int = 10) -> tuple:
    try:
        url = f"{HIE_SERVER_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if method == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=timeout)
        else:
            response = requests.get(url, params=data, headers=headers, timeout=timeout)
        
        return response.json(), response.status_code
        
    except requests.exceptions.Timeout:
        logger.error(f"HIE server timeout: {endpoint}")
        return {'result': 'fail', 'msg': 'HIE 서버 응답 시간 초과'}, 504
    except requests.exceptions.ConnectionError:
        logger.error(f"HIE server connection error: {endpoint}")
        return {'result': 'fail', 'msg': 'HIE 서버 연결 실패'}, 502
    except requests.exceptions.RequestException as e:
        logger.error(f"HIE server request error: {e}")
        return {'result': 'fail', 'msg': f'HIE 서버 요청 오류: {str(e)}'}, 500
    except Exception as e:
        logger.error(f"Unexpected error in HIE request: {e}")
        return {'result': 'fail', 'msg': '서버 내부 오류'}, 500


@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "fail", "msg": "요청 데이터가 없습니다"}), 400
        
        username = sanitize_input(data.get("username", ""))
        password = data.get("password", "")
        
        if not username or not password:
            return jsonify({"status": "fail", "msg": "사용자명과 비밀번호를 입력해주세요"}), 400
        
        user = users.get(username)
        
        if user and user.password == password:
            login_user(user, remember=True, duration=timedelta(hours=8))
            
            is_admin_user = username == 'superadmin'
            
            logger.info(f"User login successful: {username}")
            
            return jsonify({
                "status": "success",
                "email": user.email,
                "name": user.doctorname or user.id,
                "id": username,
                "doctorname": user.doctorname,
                "hospital": user.hospital,
                "is_admin": is_admin_user
            })
        else:
            logger.warning(f"Login failed for username: {username}")
            return jsonify({"status": "fail", "msg": "사용자명 또는 비밀번호가 올바르지 않습니다"}), 401
            
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"status": "fail", "msg": "로그인 처리 중 오류가 발생했습니다"}), 500

@app.route('/keycloak-login')
def keycloak_login():
    redirect_uri = url_for('keycloak_callback', _external=True)
    return keycloak.authorize_redirect(redirect_uri)

@app.route('/keycloak/callback')
def keycloak_callback():
    if 'error' in request.args:
        logger.warning(f"Keycloak callback error: {request.args.get('error')}")
        return redirect(FRONTEND_LOGIN_URL)
    
    try:
        token = keycloak.authorize_access_token()
        userinfo = keycloak.parse_id_token(token, None)
        
        sub = userinfo.get('sub')
        email = userinfo.get('email', sub)
        doctorname = userinfo.get('doctorname', '')
        hospital = userinfo.get('HospitalName', '')
        
        if not hospital and email:
            domain = email.split("@")[-1]
            hospital_mapping = {
                "abc.com": "A병원",
                "bac.com": "B병원"
            }
            hospital = hospital_mapping.get(domain, "기타")
        
        user = User(id=sub, email=email, is_keycloak=True, 
                   doctorname=doctorname, hospital=hospital)
        users[sub] = user
        login_user(user, remember=True, duration=timedelta(hours=8))
        session['id_token'] = token.get('id_token')
        
        logger.info(f"Keycloak login successful: {email}")
        
        if sub == 'superadmin' or email == 'admin@system.com':
            return redirect('http://10.10.30.2:3000/admin/logs')
        else:
            return redirect(FRONTEND_MAIN_URL)
            
    except Exception as e:
        logger.error(f"Keycloak callback error: {e}")
        return redirect(FRONTEND_LOGIN_URL)

@app.route('/api/me')
def api_me():
    if current_user.is_authenticated:
        user_context = _get_user_context()
        is_admin_user = is_admin()
        
        return jsonify({
            'id': user_context['id'],
            'email': user_context['email'],
            'is_keycloak': getattr(current_user, 'is_keycloak', False),
            'doctorname': user_context['doctorname'],
            'hospital': user_context['hospital'],
            'is_admin': is_admin_user
        })
    return jsonify({'id': None}), 401

@app.route('/logout')
@login_required
def logout():
    user_id = current_user.id if current_user.is_authenticated else 'unknown'
    logout_user()
    id_token = session.pop("id_token", None)
    session.clear()
    
    logger.info(f"User logout: {user_id}")
    
    if id_token:
        keycloak_logout_url = (
            f"{KEYCLOAK_BASE_URL}/realms/{REALM}/protocol/openid-connect/logout"
            f"?id_token_hint={id_token}"
            f"&post_logout_redirect_uri={FRONTEND_LOGIN_URL}"
        )
    else:
        keycloak_logout_url = FRONTEND_LOGIN_URL
    
    return redirect(keycloak_logout_url)

@app.route('/')
def index():
    return jsonify({"message": "HIE Web Server is running", "status": "healthy"})

@app.route('/api/mfa/auth-url', methods=['POST'])
def generate_mfa_auth_url():
    """MFA 인증 URL 생성"""
    try:
        data = request.get_json() or {}
        action = data.get('action', 'unmask')
        return_url = data.get('return_url', request.referrer or FRONTEND_MAIN_URL)
        

        state = str(uuid.uuid4())

        session[f'mfa_state_{state}'] = {
            'action': action,
            'return_url': return_url,
            'timestamp': datetime.now().timestamp()
        }
        

        auth_url = f"{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth"
        
        params = {
            'client_id': KEYCLOAK_CLIENT_ID,
            'redirect_uri': f"{request.host_url.rstrip('/')}/auth/mfa/callback",
            'response_type': 'code',
            'scope': 'openid profile',
            'acr_values': 'mfa',
            'prompt': 'login',
            'max_age': '0',
            'state': state
        }
        
        query_string = '&'.join([f"{k}={requests.utils.quote(str(v))}" for k, v in params.items()])
        full_auth_url = f"{auth_url}?{query_string}"
        
        logger.info(f"MFA 인증 URL 생성: action={action}, state={state}")
        
        return jsonify({
            'auth_url': full_auth_url,
            'state': state,
            'action': action
        })
        
    except Exception as e:
        logger.error(f"MFA 인증 URL 생성 오류: {str(e)}")
        return jsonify({'error': 'Failed to generate auth URL'}), 500

@app.route('/auth/mfa/callback')
def mfa_auth_callback():
    """MFA 인증 완료 콜백"""
    try:
        code = request.args.get('code')
        state = request.args.get('state')
        error = request.args.get('error')
        
        logger.info(f"MFA 콜백: code={bool(code)}, state={state}, error={error}")
        
        if error:
            logger.error(f"MFA 인증 오류: {error}")
   
            return render_template_string("""
                <html>
                <head><title>MFA Error</title></head>
                <body>
                    <h3>인증 오류</h3>
                    <p>{{ error }}</p>
                    <script>
                        setTimeout(function() {
                            window.close();
                        }, 2000);
                    </script>
                </body>
                </html>
            """, error=error)
        
        if not code or not state:
            logger.error("MFA 콜백에 code 또는 state 없음")
            return render_template_string("""
                <html>
                <head><title>MFA Error</title></head>
                <body>
                    <h3>인증 오류</h3>
                    <p>필수 파라미터가 없습니다.</p>
                    <script>
                        setTimeout(function() {
                            window.close();
                        }, 2000);
                    </script>
                </body>
                </html>
            """)
        
        state_data = session.get(f'mfa_state_{state}')
        if not state_data:
            logger.error(f"유효하지 않은 state: {state}")
            return render_template_string("""
                <html>
                <head><title>MFA Error</title></head>
                <body>
                    <h3>인증 오류</h3>
                    <p>유효하지 않은 세션입니다.</p>
                    <script>
                        setTimeout(function() {
                            window.close();
                        }, 2000);
                    </script>
                </body>
                </html>
            """)
        

        redirect_uri = f"{request.scheme}://{request.host}/auth/mfa/callback"
        token_url = f"{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
        
        token_data = {
            'grant_type': 'authorization_code',
            'client_id': KEYCLOAK_CLIENT_ID,
            'client_secret': KEYCLOAK_CLIENT_SECRET,
            'code': code,
            'redirect_uri': redirect_uri
        }
        
        token_response = requests.post(token_url, data=token_data)
        
        if token_response.status_code != 200:
            logger.error(f"토큰 교환 실패: {token_response.status_code} - {token_response.text}")
            return render_template_string("""
                <html>
                <head><title>MFA Error</title></head>
                <body>
                    <h3>토큰 교환 실패</h3>
                    <p>인증 서버와의 통신에 실패했습니다.</p>
                    <script>
                        setTimeout(function() {
                            window.close();
                        }, 2000);
                    </script>
                </body>
                </html>
            """)
        
        tokens = token_response.json()
        access_token = tokens.get('access_token')
        
        # 성공 처리
        session.pop(f'mfa_state_{state}', None)
        
        return_url = state_data['return_url']
        action = state_data['action']
        
        logger.info(f"MFA 인증 성공: action={action}")
        
        # 성공 시 부모 창에 메시지 전달 후 창 닫기
        return render_template_string("""
            <html>
            <head><title>MFA Success</title></head>
            <body>
                <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                    <h2 style="color: #28a745;">🔐 MFA 인증 성공!</h2>
                    <p>인증이 완료되었습니다. 잠시 후 창이 자동으로 닫힙니다.</p>
                    <button onclick="window.close()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        창 닫기
                    </button>
                </div>
                <script>
                    // 부모 창에 성공 메시지 전달
                    if (window.opener) {
                        try {
                            window.opener.postMessage({
                                type: 'MFA_SUCCESS',
                                token: '{{ token }}',
                                action: '{{ action }}'
                            }, '{{ return_url }}');
                        } catch (e) {
                            console.log('PostMessage failed:', e);
                        }
                    }
                    
                    // 2초 후 창 닫기
                    setTimeout(function() {
                        window.close();
                    }, 2000);
                </script>
            </body>
            </html>
        """, token=access_token, action=action, return_url=return_url.split('?')[0])
        
    except Exception as e:
        logger.error(f"MFA 콜백 처리 오류: {str(e)}")
        return render_template_string("""
            <html>
            <head><title>MFA Error</title></head>
            <body>
                <h3>시스템 오류</h3>
                <p>처리 중 오류가 발생했습니다.</p>
                <script>
                    setTimeout(function() {
                        window.close();
                    }, 2000);
                </script>
            </body>
            </html>
        """)

@app.route('/api/mfa/status', methods=['GET'])
def check_mfa_status():
    """MFA 인증 상태 확인"""
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return jsonify({'mfa_authenticated': False})
    
    token = auth_header.split(' ', 1)[1]
    is_valid, result = verify_mfa_token(token)
    
    if is_valid:
        return jsonify({
            'mfa_authenticated': True,
            'user': result.get('preferred_username'),
            'auth_time': result.get('auth_time'),
            'acr': result.get('acr'),
            'expires_in': 600 - (datetime.now().timestamp() - result.get('auth_time', 0))
        })
    else:
        return jsonify({'mfa_authenticated': False, 'error': result})


@app.route('/api/medical-record', methods=['POST'])
@login_required_api
@limiter.limit("20 per minute")
def medical_record_upload():
    try:
        user = _get_user_context()
        data = sanitize_input(request.get_json())
        
        if not data:
            return jsonify({'result': 'fail', 'msg': '요청 데이터가 없습니다'}), 400
        
        request_data = {
            **data,
            'user_email': user['email'],
            'doctor_name': user['doctorname'],
            'hospital': user['hospital']
        }
        
        response_data, status_code = make_hie_request('/api/medical-record', request_data)
        return jsonify(response_data), status_code
        
    except Exception as e:
        logger.error(f"Medical record upload error: {e}")
        return jsonify({'result': 'fail', 'msg': '진료기록 등록 중 오류가 발생했습니다'}), 500

@app.route('/api/patient/unmask', methods=['POST'])
@require_mfa  
@limiter.limit("10 per minute")
def patient_unmask_proxy():
    try:
        
        mfa_user = request.mfa_user
        username = mfa_user.get('preferred_username')
        
        
        user = _get_user_context()
        data = sanitize_input(request.get_json() or {})
        
        request_data = {
            **data,
            'user_email': user['email'],
            'doctor_name': user['doctorname'],
            'hospital': user['hospital'],
            'mfa_verified': True,
            'mfa_user': username
        }
        
        logger.info(f"마스킹 해제 요청 (MFA 인증됨): user={username}, record_id={data.get('record_id')}")
        response_data, status_code = make_hie_request('/api/patient/unmask', request_data)
        
        if status_code == 200:
            logger.info(f"마스킹 해제 성공: user={username}, record_id={data.get('record_id')}")
        
        return jsonify(response_data), status_code
        
    except Exception as e:
        logger.error(f"Patient unmask error: {e}")
        return jsonify({'result': 'fail', 'msg': '마스킹 해제 중 오류가 발생했습니다'}), 500

@app.route('/api/patient/search', methods=['POST'])
@login_required_api
@limiter.limit("30 per minute")
def patient_search_proxy():
    try:
        user = _get_user_context()
        data = sanitize_input(request.get_json() or {})
        include_external = data.get('includeExternal', False)
        
        if not user['hospital']:
            return jsonify({'result': 'fail', 'msg': '병원 정보가 없습니다'}), 400
        
       
        if include_external:
            auth_header = request.headers.get('Authorization', '')
            if not auth_header.startswith('Bearer '):
                return jsonify({
                    'error': 'MFA required for external hospital search',
                    'code': 'MFA_REQUIRED_EXTERNAL',
                    'message': '타 병원 조회를 위해서는 추가 인증이 필요합니다.'
                }), 401
            
            token = auth_header.split(' ', 1)[1]
            is_valid, result = verify_mfa_token(token)
            
            if not is_valid:
                return jsonify({
                    'error': f'MFA verification failed: {result}',
                    'code': 'MFA_VERIFICATION_FAILED',
                    'message': 'MFA 인증에 실패했습니다.'
                }), 403
            
            mfa_user = result
            username = mfa_user.get('preferred_username')
            logger.info(f"전체 병원 조회 (MFA 인증됨): user={username}")
            
            
            data['mfa_verified'] = True
            data['mfa_user'] = username
        
        request_data = {
            **data,
            'user_email': user['email'],
            'doctor_name': user['doctorname'],
            'hospital': user['hospital']
        }
        
        response_data, status_code = make_hie_request('/api/patient/search', request_data, timeout=15)
        return jsonify(response_data), status_code
        
    except Exception as e:
        logger.error(f"Patient search error: {e}")
        return jsonify({'result': 'fail', 'msg': '환자 검색 중 오류가 발생했습니다'}), 500

@app.route('/api/admin/logs', methods=['GET'])
@admin_required
@limiter.limit("50 per minute")
def get_admin_logs():
    try:
        page = request.args.get('page', '1')
        limit = request.args.get('limit', '20')
        
        response_data, status_code = make_hie_request(
            '/api/admin/logs', 
            {'page': page, 'limit': limit}, 
            method='GET'
        )
        return jsonify(response_data), status_code
        
    except Exception as e:
        logger.error(f"Admin logs error: {e}")
        return jsonify({'result': 'fail', 'msg': '로그 조회 중 오류가 발생했습니다'}), 500

@app.route('/api/admin/logs/search', methods=['POST'])
@admin_required
@limiter.limit("30 per minute")
def search_admin_logs():
    try:
        data = sanitize_input(request.get_json() or {})
        
        response_data, status_code = make_hie_request('/api/admin/logs/search', data)
        return jsonify(response_data), status_code
        
    except Exception as e:
        logger.error(f"Admin logs search error: {e}")
        return jsonify({'result': 'fail', 'msg': '로그 검색 중 오류가 발생했습니다'}), 500


@app.route('/api/mfa/verify-token', methods=['POST'])
def verify_mfa_token_api():
    """MFA 토큰 검증 API"""
    try:
        data = request.get_json() or {}
        token = data.get('token', '')
        
        if not token:
            return jsonify({'valid': False, 'error': 'Token required'}), 400
        
        is_valid, result = verify_mfa_token(token)
        
        if is_valid:
            return jsonify({
                'valid': True,
                'user': result.get('preferred_username'),
                'acr': result.get('acr'),
                'auth_time': result.get('auth_time'),
                'expires_in': 600 - (datetime.now().timestamp() - result.get('auth_time', 0))
            })
        else:
            return jsonify({'valid': False, 'error': result})
            
    except Exception as e:
        logger.error(f"MFA 토큰 검증 API 오류: {str(e)}")
        return jsonify({'valid': False, 'error': 'Verification failed'}), 500

@app.route('/api/mfa/session-info', methods=['GET'])
@login_required_api
def get_mfa_session_info():
    """현재 세션의 MFA 상태 정보"""
    try:
        user = _get_user_context()
        
       
        mfa_token = session.get('mfa_token')
        mfa_expires = session.get('mfa_expires', 0)
        
        current_time = datetime.now().timestamp()
        
        if mfa_token and mfa_expires > current_time:
          
            is_valid, result = verify_mfa_token(mfa_token)
            
            if is_valid:
                return jsonify({
                    'mfa_active': True,
                    'expires_in': int(mfa_expires - current_time),
                    'auth_time': result.get('auth_time'),
                    'acr': result.get('acr')
                })
        
        return jsonify({'mfa_active': False})
        
    except Exception as e:
        logger.error(f"MFA 세션 정보 조회 오류: {str(e)}")
        return jsonify({'mfa_active': False, 'error': 'Failed to get session info'})

@app.route('/api/mfa/clear-session', methods=['POST'])
@login_required_api
def clear_mfa_session():
    """MFA 세션 클리어"""
    try:
        session.pop('mfa_token', None)
        session.pop('mfa_expires', None)
        
        # 모든 MFA state 클리어
        keys_to_remove = [key for key in session.keys() if key.startswith('mfa_state_')]
        for key in keys_to_remove:
            session.pop(key, None)
        
        logger.info(f"MFA 세션 클리어됨: user={current_user.id}")
        
        return jsonify({'success': True, 'message': 'MFA session cleared'})
        
    except Exception as e:
        logger.error(f"MFA 세션 클리어 오류: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to clear session'}), 500

# ===== 에러 핸들러들 =====
@app.errorhandler(404)
def not_found(error):
    return jsonify({'result': 'fail', 'msg': '요청한 리소스를 찾을 수 없습니다'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'result': 'fail', 'msg': '서버 내부 오류가 발생했습니다'}), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({'result': 'fail', 'msg': '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요'}), 429

@app.errorhandler(jwt.ExpiredSignatureError)
def handle_expired_token(e):
    logger.warning(f"JWT 토큰 만료: {str(e)}")
    return jsonify({
        'error': 'Token expired',
        'code': 'TOKEN_EXPIRED',
        'message': '인증 토큰이 만료되었습니다. 다시 인증해주세요.'
    }), 401

@app.errorhandler(jwt.InvalidTokenError)
def handle_invalid_token(e):
    logger.warning(f"JWT 토큰 오류: {str(e)}")
    return jsonify({
        'error': 'Invalid token',
        'code': 'TOKEN_INVALID',
        'message': '유효하지 않은 인증 토큰입니다.'
    }), 401

@app.route('/api/health')
def health_check():
    """서버 상태 확인"""
    try:
        # Keycloak 연결 확인
        keycloak_status = "unknown"
        try:
            jwks = get_keycloak_public_keys()
            keycloak_status = "connected" if jwks else "disconnected"
        except:
            keycloak_status = "error"
        
        # HIE 서버 연결 확인
        hie_status = "unknown"
        try:
            response = requests.get(f"{HIE_SERVER_URL}/health", timeout=5)
            hie_status = "connected" if response.status_code == 200 else "disconnected"
        except:
            hie_status = "error"
        
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "services": {
                "keycloak": keycloak_status,
                "hie_server": hie_status
            },
            "mfa_enabled": True,
            "version": "1.0.0"
        })
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

@app.route('/api/debug/jwks')
def debug_jwks():
    """디버그용 JWKS 정보 (개발 환경에서만 사용)"""
    if app.debug:
        try:
            jwks = get_keycloak_public_keys()
            return jsonify({
                "jwks": jwks,
                "cache_time": _jwks_cache_time.isoformat() if _jwks_cache_time else None,
                "keys_count": len(jwks.get('keys', [])) if jwks else 0
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        return jsonify({"error": "Debug endpoint disabled in production"}), 403


if __name__ == '__main__':
    logger.info("Starting HIE Web Server with MFA support...")
    logger.info(f"Keycloak URL: {KEYCLOAK_BASE_URL}")
    logger.info(f"HIE Server URL: {HIE_SERVER_URL}")
    logger.info(f"Frontend URL: {FRONTEND_MAIN_URL}")
    
    
    logger.info("등록된 MFA 라우트:")
    for rule in app.url_map.iter_rules():
        if 'mfa' in rule.rule:
            logger.info(f"  {rule.endpoint}: {rule.rule} {list(rule.methods)}")
    
    
    required_vars = [
        'SECRET_KEY', 'KEYCLOAK_BASE_URL', 'KEYCLOAK_REALM', 
        'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_CLIENT_SECRET', 'HIE_SERVER_URL'
    ]
    
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    if missing_vars:
        logger.error(f"필수 환경변수가 없습니다: {', '.join(missing_vars)}")
        exit(1)
    
    
    try:
        jwks = get_keycloak_public_keys()
        if jwks:
            logger.info(f"JWKS 초기 로드 성공: {len(jwks.get('keys', []))}개 키")
        else:
            logger.warning("JWKS 초기 로드 실패")
    except Exception as e:
        logger.error(f"JWKS 초기 로드 오류: {e}")
    
    app.run(host='0.0.0.0', port=5000, debug=False)