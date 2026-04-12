"""
配置管理模块
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 加载.env文件
load_dotenv(Path(__file__).parent.parent / ".env")


class Settings:
    """应用配置"""

    # 应用配置
    APP_NAME = "FTA智能生成系统"
    APP_VERSION = "1.0.0"
    DEBUG = os.getenv("DEBUG", "true").lower() == "true"

    # 服务器配置
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "8000"))

    # SQLite配置
    DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent.parent / "fta.db"))

    @property
    def DATABASE_URL(self):
        # 适配 Windows 路径，确保有三个斜杠
        path = self.DB_PATH.replace('\\', '/')
        if not path.startswith('/'):
            path = '/' + path
        return f"sqlite+aiosqlite://{path}"

    # DeepSeek API配置
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_API_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/v1")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    DEEPSEEK_TEMPERATURE = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.1"))
    DEEPSEEK_MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "4000"))

    # JWT配置
    JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

    # 文件上传配置
    MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", str(50 * 1024 * 1024)))  # 50MB
    ALLOWED_EXTENSIONS = ["pdf", "docx", "xlsx", "png", "jpg", "jpeg", "txt"]
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(Path(__file__).parent.parent / "uploads"))

    # 日志配置
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")


# 全局配置实例
settings = Settings()
