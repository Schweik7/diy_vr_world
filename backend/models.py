"""
数据库模型定义
"""
from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from enum import Enum


class FeedbackType(str, Enum):
    """反馈类型"""
    FEATURE_REQUEST = "feature_request"  # 期待的交互建议
    BUG_REPORT = "bug_report"  # bug反馈


# ==================== 用户模型 ====================

class User(SQLModel, table=True):
    """用户表"""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # 关系
    worlds: List["World"] = Relationship(back_populates="user")
    chats: List["Chat"] = Relationship(back_populates="user")
    feedbacks: List["Feedback"] = Relationship(back_populates="user")


# ==================== 世界配置模型 ====================

class World(SQLModel, table=True):
    """用户创建的世界配置"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(default="我的世界")

    # 自定义资源路径（相对于uploads目录）
    sky_texture: Optional[str] = None  # 天空贴图
    fairy_model: Optional[str] = None  # 精灵模型
    background_music: Optional[str] = None  # 背景音乐

    # 精灵配置
    system_prompt: Optional[str] = None  # 系统提示词
    greeting_message: Optional[str] = None  # 初次见面语

    # 场景库展示信息
    description: Optional[str] = None  # 场景简介（场景库展示用）
    cover_image: Optional[str] = None  # 封面图（相对uploads路径）

    # 元数据
    is_public: bool = Field(default=False)  # 是否公开分享（公开后进入心声世界场景库）
    view_count: int = Field(default=0)  # 被体验次数
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # 关系
    user: Optional[User] = Relationship(back_populates="worlds")


# ==================== 聊天记录模型 ====================

class Chat(SQLModel, table=True):
    """聊天记录表"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    world_id: Optional[int] = Field(default=None, foreign_key="world.id", index=True)
    role: str  # "user" 或 "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # 关系
    user: Optional[User] = Relationship(back_populates="chats")


# ==================== 上传记录模型 ====================

class UploadRecord(SQLModel, table=True):
    """文件上传记录"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    world_id: Optional[int] = Field(default=None, foreign_key="world.id", index=True)

    file_type: str  # "sky_texture", "fairy_model", "background_music", "system_prompt"
    original_filename: str
    stored_filename: str
    file_path: str
    file_size: int

    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


# ==================== 反馈模型 ====================

class Feedback(SQLModel, table=True):
    """用户反馈表"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    feedback_type: str  # FeedbackType
    title: str
    content: str

    # 状态
    status: str = Field(default="pending")  # pending, reviewed, resolved

    created_at: datetime = Field(default_factory=datetime.utcnow)

    # 关系
    user: Optional[User] = Relationship(back_populates="feedbacks")


# ==================== 世界分享模型 ====================

class WorldShare(SQLModel, table=True):
    """世界分享记录"""
    id: Optional[int] = Field(default=None, primary_key=True)
    world_id: int = Field(foreign_key="world.id", index=True)
    share_code: str = Field(unique=True, index=True)  # 分享码

    view_count: int = Field(default=0)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None  # 过期时间，null表示永不过期
