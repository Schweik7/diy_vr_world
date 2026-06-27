"""
数据库和应用配置模块
支持SQLite（默认）和MySQL
"""
import os
from dotenv import load_dotenv
from sqlmodel import create_engine, SQLModel
from typing import Optional

load_dotenv()

# 数据库配置
# 默认使用SQLite，可通过环境变量DATABASE_URL配置MySQL
# MySQL示例: mysql+pymysql://user:password@localhost:3306/dbname
# SQLite示例: sqlite:///./chat_database.db
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chat_database.db")

# 根据数据库类型配置引擎参数
def get_engine_args():
    """获取数据库引擎参数"""
    if DATABASE_URL.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {}

# 创建数据库引擎
engine = create_engine(DATABASE_URL, **get_engine_args())

# 应用配置
class Settings:
    # 环境配置
    ENV: str = os.getenv("ENV", "development")

    # 文件上传配置
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))  # 50MB

    # 允许的文件类型
    ALLOWED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".hdr"}
    ALLOWED_MODEL_TYPES = {".gltf", ".glb", ".bin"}
    ALLOWED_AUDIO_TYPES = {".mp3", ".wav", ".ogg"}
    ALLOWED_TEXT_TYPES = {".md", ".txt"}

    # API密钥
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")

    # 代理配置（开发环境）
    PROXY_URL: str = os.getenv("PROXY_URL", "http://127.0.0.1:10809")

settings = Settings()

def init_db():
    """初始化数据库表"""
    SQLModel.metadata.create_all(engine)
    # 运行迁移检查
    migrate_db()

def migrate_db():
    """检查并添加缺失的数据库列"""
    from sqlalchemy import text, inspect

    inspector = inspect(engine)

    # 检查chat表是否存在world_id列
    if 'chat' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('chat')]
        if 'world_id' not in columns:
            print("正在为chat表添加world_id列...")
            with engine.connect() as conn:
                if DATABASE_URL.startswith("sqlite"):
                    conn.execute(text("ALTER TABLE chat ADD COLUMN world_id INTEGER"))
                else:
                    conn.execute(text("ALTER TABLE chat ADD COLUMN world_id INTEGER"))
                conn.commit()
            print("world_id列添加成功")

    # 检查world表的新增列（场景库 / 个人中心相关）
    if 'world' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('world')]
        new_columns = {
            'description': 'TEXT',
            'cover_image': 'VARCHAR',
            'view_count': 'INTEGER DEFAULT 0',
        }
        with engine.connect() as conn:
            for col_name, col_type in new_columns.items():
                if col_name not in columns:
                    print(f"正在为world表添加{col_name}列...")
                    conn.execute(text(f"ALTER TABLE world ADD COLUMN {col_name} {col_type}"))
            conn.commit()

def reset_db():
    """重置数据库（删除所有表并重新创建）"""
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)

def get_db_info():
    """获取数据库信息"""
    db_type = "SQLite" if DATABASE_URL.startswith("sqlite") else "MySQL"
    return {
        "type": db_type,
        "url": DATABASE_URL if db_type == "SQLite" else DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL
    }
