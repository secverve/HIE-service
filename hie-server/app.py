import os
import pymysql
import logging
import logging.handlers
import socket
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from contextlib import contextmanager
from typing import Dict, List, Optional, Any, Tuple
import bleach
from html import escape
from dataclasses import dataclass
import threading
from concurrent.futures import ThreadPoolExecutor

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True)

@dataclass
class Config:
    ESM_SERVER_HOST: str = os.environ.get('ESM_SERVER_HOST')
    ESM_SERVER_PORT: int = int(os.environ.get('ESM_SERVER_PORT', 514))
    
    DB_HOST: str = os.environ.get('DB_HOST')
    DB_PORT: int = int(os.environ.get('DB_PORT', 3306))
    DB_USER: str = os.environ.get('DB_USER')
    DB_PASS: str = os.environ.get('DB_PASS')
    DB_NAME: str = os.environ.get('DB_NAME')
    DB_AES_KEY: str = os.environ.get('DB_AES_KEY')
    
    @classmethod
    def validate_config(cls):
        required_vars = ['ESM_SERVER_HOST', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_AES_KEY']
        missing_vars = []
        
        for var in required_vars:
            if not os.environ.get(var):
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(f"다음 환경변수들이 설정되지 않았습니다: {', '.join(missing_vars)}")

config = Config()
config.validate_config()

# Rate Limiter 수정
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["2000 per day", "200 per hour"]
)

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler('hie_server.log')
        ]
    )
    
    esm_logger = logging.getLogger('hie_esm_logger')
    esm_logger.setLevel(logging.INFO)
    
    for handler in esm_logger.handlers[:]:
        esm_logger.removeHandler(handler)
    
    try:
        syslog_handler = logging.handlers.SysLogHandler(
            address=(config.ESM_SERVER_HOST, config.ESM_SERVER_PORT),
            socktype=socket.SOCK_DGRAM
        )
        
        formatter = logging.Formatter('HIE-SERVER: %(message)s')
        syslog_handler.setFormatter(formatter)
        esm_logger.addHandler(syslog_handler)
        
        print(f"HIE ESM 로거 설정 완료: {config.ESM_SERVER_HOST}:{config.ESM_SERVER_PORT}")
    except Exception as e:
        print(f"HIE ESM 로거 설정 실패: {e}")
        file_handler = logging.FileHandler('hie_audit.log')
        formatter = logging.Formatter('HIE-SERVER: %(message)s')
        file_handler.setFormatter(formatter)
        esm_logger.addHandler(file_handler)
    
    return esm_logger

esm_logger = setup_logging()
logger = logging.getLogger(__name__)

executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hie-logger")

class DatabaseManager:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.pool_size = 10
            self.initialized = True
    
    @contextmanager
    def get_connection(self):
        conn = None
        try:
            conn = pymysql.connect(
                host=config.DB_HOST,
                port=config.DB_PORT,
                user=config.DB_USER,
                password=config.DB_PASS,
                db=config.DB_NAME,
                charset='utf8mb4',
                autocommit=False,
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=5,
                read_timeout=10,
                write_timeout=10
            )
            yield conn
        except pymysql.Error as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Unexpected database error: {e}")
            raise
        finally:
            if conn:
                conn.close()

db_manager = DatabaseManager()

def sanitize_input(data: Any) -> Any:
    if isinstance(data, str):
        return bleach.clean(escape(data.strip()))
    elif isinstance(data, dict):
        return {k: sanitize_input(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_input(item) for item in data]
    return data

def validate_required_fields(data: Dict[str, Any], required_fields: List[str]) -> Tuple[bool, str]:
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return False, f"다음 필드들이 필요합니다: {', '.join(missing_fields)}"
    return True, ""

@dataclass
class UserInfo:
    email: str
    doctor_name: str
    hospital: str
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UserInfo':
        return cls(
            email=data.get('user_email', 'unknown'),
            doctor_name=data.get('doctor_name', 'unknown'),
            hospital=data.get('hospital', 'unknown')
        )

def log_to_esm_async(action: str, user_info: UserInfo, additional_info: str = ""):
    def _log():
        try:
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            log_message = (f"[{action}] 입력자: {user_info.email}, "
                         f"이름: {user_info.doctor_name}, "
                         f"소속: {user_info.hospital}, "
                         f"입력시각: {now}")
            
            if additional_info:
                log_message += f", {additional_info}"
            
            esm_logger.info(log_message)
            logger.info(f"[HIE ESM LOG] {log_message}")
            
            try:
                with db_manager.get_connection() as conn:
                    with conn.cursor() as cur:
                        sql = """
                        INSERT INTO audit_logs (action, user_email, user_name, hospital, additional_info)
                        VALUES (%s, %s, %s, %s, %s)
                        """
                        cur.execute(sql, (
                            action,
                            user_info.email,
                            user_info.doctor_name,
                            user_info.hospital,
                            additional_info
                        ))
                        conn.commit()
                        logger.debug(f"[DB LOG] 로그 저장 완료: {action}")
            except Exception as db_e:
                logger.error(f"DB 로그 저장 실패: {db_e}")
                
        except Exception as e:
            logger.error(f"로그 전송 실패: {e}")
    
    executor.submit(_log)

class MaskingService:
    @staticmethod
    def mask_name(name: Optional[str]) -> str:
        if not name or len(name) < 2:
            return name or ""
        if len(name) == 2:
            return name[0] + "*"
        return name[0] + "*" * (len(name) - 2) + name[-1]

    @staticmethod
    def mask_address(address: Optional[str]) -> str:
        if not address:
            return ""
        
        gu_keywords = ['구', '군', '시']
        for keyword in gu_keywords:
            if keyword in address:
                idx = address.find(keyword)
                if idx != -1:
                    return address[:idx + 1] + " " + "*" * (len(address) - idx - 1)
        
        mid_point = len(address) // 2
        return address[:mid_point] + "*" * (len(address) - mid_point)

    @staticmethod
    def mask_diagnosis(diagnosis: Optional[str]) -> str:
        return "[마스킹됨]" if diagnosis else ""

    @staticmethod
    def mask_description(description: Optional[str]) -> str:
        return "[마스킹됨]" if description else ""

masking_service = MaskingService()

@app.route('/api/admin/logs', methods=['GET'])
@limiter.limit("100 per minute")
def get_audit_logs():
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        
        if page < 1:
            page = 1
        if limit < 1 or limit > 100:
            limit = 20
            
        offset = (page - 1) * limit
        
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                count_sql = "SELECT COUNT(*) as total FROM audit_logs"
                cur.execute(count_sql)
                total_result = cur.fetchone()
                total = total_result['total'] if total_result else 0
                
                sql = """
                SELECT id, action, user_email, user_name, hospital, 
                       additional_info, created_at
                FROM audit_logs 
                ORDER BY created_at DESC 
                LIMIT %s OFFSET %s
                """
                cur.execute(sql, (limit, offset))
                logs = cur.fetchall()
                
                for log in logs:
                    if log['created_at']:
                        log['created_at'] = log['created_at'].strftime('%Y-%m-%d %H:%M:%S')
                
                conn.commit()
                
                return jsonify({
                    'result': 'success',
                    'logs': logs,
                    'total': total,
                    'page': page,
                    'limit': limit
                })
                
    except ValueError as e:
        logger.warning(f"Invalid parameter in logs request: {e}")
        return jsonify({'result': 'fail', 'msg': '잘못된 매개변수입니다'}), 400
    except Exception as e:
        logger.error(f"로그 조회 실패: {e}")
        return jsonify({'result': 'fail', 'msg': '로그 조회 중 오류가 발생했습니다'}), 500

@app.route('/api/admin/logs/search', methods=['POST'])
@limiter.limit("50 per minute")
def search_audit_logs():
    try:
        data = sanitize_input(request.get_json() or {})
        
        action = data.get('action', '').strip()
        user_email = data.get('user_email', '').strip()
        hospital = data.get('hospital', '').strip()
        start_date = data.get('start_date', '').strip()
        end_date = data.get('end_date', '').strip()
        page = int(data.get('page', 1))
        limit = int(data.get('limit', 20))
        
        if page < 1:
            page = 1
        if limit < 1 or limit > 100:
            limit = 20
            
        offset = (page - 1) * limit
        
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                where_conditions = []
                params = []
                
                if action:
                    where_conditions.append("action LIKE %s")
                    params.append(f"%{action}%")
                if user_email:
                    where_conditions.append("user_email LIKE %s")
                    params.append(f"%{user_email}%")
                if hospital:
                    where_conditions.append("hospital LIKE %s")
                    params.append(f"%{hospital}%")
                if start_date:
                    where_conditions.append("DATE(created_at) >= %s")
                    params.append(start_date)
                if end_date:
                    where_conditions.append("DATE(created_at) <= %s")
                    params.append(end_date)
                
                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                count_sql = f"SELECT COUNT(*) as total FROM audit_logs WHERE {where_clause}"
                cur.execute(count_sql, params)
                total_result = cur.fetchone()
                total = total_result['total'] if total_result else 0
                
                sql = f"""
                SELECT id, action, user_email, user_name, hospital, 
                       additional_info, created_at
                FROM audit_logs 
                WHERE {where_clause}
                ORDER BY created_at DESC 
                LIMIT %s OFFSET %s
                """
                cur.execute(sql, params + [limit, offset])
                logs = cur.fetchall()
                
                for log in logs:
                    if log['created_at']:
                        log['created_at'] = log['created_at'].strftime('%Y-%m-%d %H:%M:%S')
                
                conn.commit()
                
                return jsonify({
                    'result': 'success',
                    'logs': logs,
                    'total': total,
                    'page': page,
                    'limit': limit
                })
                
    except ValueError as e:
        logger.warning(f"Invalid parameter in logs search: {e}")
        return jsonify({'result': 'fail', 'msg': '잘못된 검색 매개변수입니다'}), 400
    except Exception as e:
        logger.error(f"로그 검색 실패: {e}")
        return jsonify({'result': 'fail', 'msg': '로그 검색 중 오류가 발생했습니다'}), 500

@app.route('/api/medical-record', methods=['POST'])
@limiter.limit("50 per minute")
def register_record():
    try:
        data = sanitize_input(request.get_json())
        if not data:
            return jsonify({'result': 'fail', 'msg': '요청 데이터가 없습니다'}), 400
        
        required_fields = ['patient_no', 'name', 'user_email', 'doctor_name', 'hospital']
        is_valid, error_msg = validate_required_fields(data, required_fields)
        if not is_valid:
            return jsonify({'result': 'fail', 'msg': error_msg}), 400
        
        user_info = UserInfo.from_dict(data)
        
        additional_info = (f"환자번호: {data.get('patient_no', 'N/A')}, "
                         f"환자명: {data.get('name', 'N/A')}, "
                         f"진단명: {data.get('diagnosis', 'N/A')}, "
                         f"진단코드: {data.get('disease_code', 'N/A')}")
        log_to_esm_async("진료입력시작", user_info, additional_info)
        
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO medical_records (
                    patient_no, name, gender, ssn, address,
                    department, disease_code, diagnosis,
                    visit_start, visit_end,
                    description, note,
                    doctor_name, hospital, hospital_address,
                    issue_date, created_at
                ) VALUES (
                    %s, %s, %s, AES_ENCRYPT(%s, %s), %s,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s, %s,
                    %s, NOW()
                )
                """
                cur.execute(sql, (
                    data.get('patient_no', ''),
                    data.get('name', ''),
                    data.get('gender', ''),
                    data.get('ssn', ''), config.DB_AES_KEY,
                    data.get('address', ''),
                    data.get('department', ''),
                    data.get('disease_code', ''),
                    data.get('diagnosis', ''),
                    data.get('visit_start', ''),
                    data.get('visit_end', ''),
                    data.get('description', ''),
                    data.get('note', ''),
                    data.get('doctor_name', ''),
                    data.get('hospital', ''),
                    data.get('hospital_address', ''),
                    data.get('issue_date', '')
                ))
                
                record_id = cur.lastrowid
                conn.commit()
                
                log_to_esm_async("진료입력완료", user_info, 
                               f"환자번호: {data.get('patient_no', 'N/A')}, 레코드ID: {record_id}, 결과: 성공")
                
        return jsonify({'result': 'success', 'record_id': record_id})
        
    except pymysql.Error as e:
        logger.error(f"Database error in medical record registration: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        log_to_esm_async("진료입력실패", user_info, 
                       f"환자번호: {data.get('patient_no', 'N/A') if 'data' in locals() else 'N/A'}, DB오류: {str(e)}")
        return jsonify({'result': 'fail', 'msg': '데이터베이스 오류가 발생했습니다'}), 500
    except Exception as e:
        logger.error(f"Medical record registration error: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        log_to_esm_async("진료입력실패", user_info, 
                       f"환자번호: {data.get('patient_no', 'N/A') if 'data' in locals() else 'N/A'}, 오류: {str(e)}")
        return jsonify({'result': 'fail', 'msg': '진료기록 등록 중 오류가 발생했습니다'}), 500

@app.route('/api/patient/search', methods=['POST'])
@limiter.limit("100 per minute")
def patient_search():
    try:
        data = sanitize_input(request.get_json())
        if not data:
            return jsonify({'result': 'fail', 'msg': '요청 데이터가 없습니다'}), 400
        
        user_info = UserInfo.from_dict(data)
        
        include_external = data.get('includeExternal', False)
        search_type = "전체병원조회" if include_external else "내병원조회"
        
        name = data.get('name', '').strip()
        patient_no = data.get('patient_id', '').strip()
        birth6 = data.get('birth6', '').strip()
        start_date = data.get('start_date', '').strip()
        end_date = data.get('end_date', '').strip()
        department = data.get('department', '').strip()
        doctor_name_search = data.get('doctor_name_search', '').strip()

        search_conditions = []
        if name: search_conditions.append(f"환자명:{name}")
        if patient_no: search_conditions.append(f"환자번호:{patient_no}")
        if birth6: search_conditions.append(f"생년월일:{birth6}")
        if start_date: search_conditions.append(f"시작일:{start_date}")
        if end_date: search_conditions.append(f"종료일:{end_date}")
        if department: search_conditions.append(f"진료과:{department}")
        if doctor_name_search: search_conditions.append(f"담당의:{doctor_name_search}")
        
        search_info = f"검색조건: {', '.join(search_conditions) if search_conditions else '전체'}"
        log_to_esm_async(f"{search_type}시작", user_info, search_info)

        conds = []
        params = []

        if not include_external and user_info.hospital:
            conds.append('hospital=%s')
            params.append(user_info.hospital)
            logger.debug(f"내 병원만 조회: {user_info.hospital}")
        else:
            logger.debug("전체 병원 조회")

        if name:
            conds.append('name=%s')
            params.append(name)
        if patient_no:
            conds.append('patient_no=%s')
            params.append(patient_no)
        if birth6:
            conds.append('LEFT(CAST(AES_DECRYPT(ssn, %s) AS CHAR),6)=%s')
            params.append(config.DB_AES_KEY)
            params.append(birth6)
        if department:
            conds.append('department=%s')
            params.append(department)
        if doctor_name_search:
            conds.append('doctor_name=%s')
            params.append(doctor_name_search)
        if start_date:
            conds.append('visit_start >= %s')
            params.append(start_date)
        if end_date:
            conds.append('visit_end <= %s')
            params.append(end_date)

        sql = """
        SELECT id, name, gender, address, CAST(AES_DECRYPT(ssn, %s) AS CHAR) AS ssn,
            patient_no, hospital, department, disease_code, diagnosis,
            visit_start, visit_end, doctor_name, issue_date, description
        FROM medical_records WHERE 
        """
        sql += " AND ".join(conds) if conds else "1"
        sql += " ORDER BY visit_start DESC LIMIT 100"
        
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, [config.DB_AES_KEY] + params)
                result = cur.fetchall()
                conn.commit()
        
        for r in result:
            if r['ssn']:
                r['ssn'] = r['ssn'][:6] + "-******"
            
            r['original_name'] = r['name']
            r['original_address'] = r['address']
            r['original_disease_code'] = r['disease_code']
            r['original_diagnosis'] = r['diagnosis']
            r['original_description'] = r['description']
            
            r['name'] = masking_service.mask_name(r['name'])
            r['address'] = masking_service.mask_address(r['address'])
            r['disease_code'] = "***"
            r['diagnosis'] = masking_service.mask_diagnosis(r['diagnosis'])
            r['description'] = masking_service.mask_description(r['description'])
        
        record_count = len(result)
        log_to_esm_async(f"{search_type}완료", user_info, 
                       f"조회결과: {record_count}건, {search_info}")
        
        search_type_display = "전체 병원" if include_external else f"{user_info.hospital}"
        return jsonify({
            'records': result, 
            'from': search_type_display,
            'count': record_count
        })
        
    except pymysql.Error as e:
        logger.error(f"Database error in patient search: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        search_info = locals().get('search_info', '알 수 없음')
        log_to_esm_async(f"{locals().get('search_type', '조회')}실패", user_info, f"DB오류: {str(e)}, {search_info}")
        return jsonify({'records': [], 'from': 'error', 'msg': '데이터베이스 오류가 발생했습니다'}), 500
    except Exception as e:
        logger.error(f"Patient search error: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        search_info = locals().get('search_info', '알 수 없음')
        log_to_esm_async(f"{locals().get('search_type', '조회')}실패", user_info, f"오류: {str(e)}, {search_info}")
        return jsonify({'records': [], 'from': 'error', 'msg': '환자 검색 중 오류가 발생했습니다'}), 500

@app.route('/api/patient/unmask', methods=['POST'])
@limiter.limit("20 per minute")
def unmask_patient_data():
    try:
        data = sanitize_input(request.get_json())
        if not data:
            return jsonify({'result': 'fail', 'msg': '요청 데이터가 없습니다'}), 400
        
        user_info = UserInfo.from_dict(data)
        
        record_id = data.get('record_id')
        fields = data.get('fields', [])
        
        if not record_id:
            return jsonify({'result': 'fail', 'msg': '레코드 ID가 필요합니다'}), 400
        
        if not fields:
            return jsonify({'result': 'fail', 'msg': '해제할 필드를 선택해주세요'}), 400
        
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                sql = """
                SELECT id, name, gender, address, CAST(AES_DECRYPT(ssn, %s) AS CHAR) AS ssn,
                    patient_no, hospital, department, disease_code, diagnosis,
                    visit_start, visit_end, doctor_name, issue_date, description
                FROM medical_records WHERE id = %s
                """
                cur.execute(sql, (config.DB_AES_KEY, record_id))
                record = cur.fetchone()
                conn.commit()
                
                if not record:
                    return jsonify({'result': 'fail', 'msg': '레코드를 찾을 수 없습니다'}), 404
                
                log_to_esm_async("개인정보마스킹해제", user_info, 
                               f"레코드ID: {record_id}, 환자명: {masking_service.mask_name(record['name'])}, 해제필드: {', '.join(fields)}")
                
                unmasked_data = {}
                valid_fields = ['name', 'address', 'disease_code', 'diagnosis', 'description']
                
                for field in fields:
                    if field in valid_fields and field in record:
                        unmasked_data[field] = record[field]
                
                return jsonify({
                    'result': 'success',
                    'record_id': record_id,
                    'unmasked_data': unmasked_data
                })
                
    except pymysql.Error as e:
        logger.error(f"Database error in unmask: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        record_id = locals().get('record_id', 'N/A')
        log_to_esm_async("개인정보마스킹해제실패", user_info, f"레코드ID: {record_id}, DB오류: {str(e)}")
        return jsonify({'result': 'fail', 'msg': '데이터베이스 오류가 발생했습니다'}), 500
    except Exception as e:
        logger.error(f"Unmask error: {e}")
        user_info = UserInfo.from_dict(data) if 'data' in locals() else UserInfo("unknown", "unknown", "unknown")
        record_id = locals().get('record_id', 'N/A')
        log_to_esm_async("개인정보마스킹해제실패", user_info, f"레코드ID: {record_id}, 오류: {str(e)}")
        return jsonify({'result': 'fail', 'msg': '마스킹 해제 중 오류가 발생했습니다'}), 500

@app.route('/')
def index():
    return jsonify({
        "message": "HIE 서버 정상동작중",
        "status": "healthy",
        "version": "2.0",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/health')
def health_check():
    try:
        with db_manager.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                db_status = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "unhealthy"
    
    return jsonify({
        "status": "healthy" if db_status == "healthy" else "unhealthy",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }), 200 if db_status == "healthy" else 503

@app.errorhandler(404)
def not_found(error):
    return jsonify({'result': 'fail', 'msg': '요청한 API를 찾을 수 없습니다'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'result': 'fail', 'msg': '서버 내부 오류가 발생했습니다'}), 500

@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({'result': 'fail', 'msg': '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요'}), 429

import atexit

def cleanup():
    logger.info("HIE 서버 종료 중...")
    executor.shutdown(wait=True)
    logger.info("HIE 서버 종료 완료")

atexit.register(cleanup)

if __name__ == "__main__":
    logger.info("HIE 서버 시작 중...")
    logger.info(f"데이터베이스: {config.DB_HOST}:{config.DB_PORT}")
    logger.info(f"ESM 서버: {config.ESM_SERVER_HOST}:{config.ESM_SERVER_PORT}")
    
    try:
        with db_manager.get_connection() as conn:
            logger.info("데이터베이스 연결 성공")
    except Exception as e:
        logger.error(f"데이터베이스 연결 실패: {e}")
        exit(1)
    
    app.run(host="0.0.0.0", port=8000, debug=False)