"""
心灵絮语后端主应用
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime
import os
import uuid
import shutil
import keyring
from anthropic import Anthropic, DefaultHttpxClient
import httpx
import jieba
import asyncio

from config import engine, settings, init_db, reset_db, get_db_info
from models import User, World, Chat, UploadRecord, Feedback, WorldShare, FeedbackType
from llm_manager import llm_manager

# 设置工作目录
os.chdir(os.path.dirname(__file__))

# 初始化数据库
init_db()

# 确保上传目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# ==================== LLM管理器已在llm_manager.py中初始化 ====================
# 检查LLM是否可用
if not llm_manager.get_available_llms():
    print("警告：没有可用的LLM配置，聊天功能将不可用")

# ==================== FastAPI应用 ====================

app = FastAPI(
    title="心灵絮语API",
    description="心灵絮语后端服务",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件服务（上传文件）
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ==================== 请求模型 ====================

class UsernameRequest(BaseModel):
    username: str

class WorldCreateRequest(BaseModel):
    name: str = "我的世界"
    system_prompt: Optional[str] = None
    greeting_message: Optional[str] = None

class WorldUpdateRequest(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    greeting_message: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None

class FeedbackRequest(BaseModel):
    feedback_type: str  # "feature_request" 或 "bug_report"
    title: str
    content: str

class CoverUploadRequest(BaseModel):
    image_base64: str  # data URL 或纯 base64 的 PNG/JPEG

# ==================== 全局状态 ====================

active_conversations: Dict[str, List[Dict]] = {}
usernames: Dict[str, str] = {}
current_username: str = None

# 默认系统提示词
with open("system_prompt_en.md", "r", encoding="utf-8") as file:
    default_system_prompt = file.read().strip()

# ==================== 用户相关路由 ====================

@app.post("/api/users/register")
async def register_user(request: UsernameRequest):
    """用户注册/登录（无密码系统）"""
    global current_username
    current_username = request.username

    with Session(engine) as session:
        existing_user = session.exec(
            select(User).where(User.username == request.username)
        ).first()

        if existing_user:
            return {
                "message": f"欢迎回来，{request.username}！",
                "user_id": existing_user.id,
                "is_new": False
            }
        else:
            new_user = User(username=request.username)
            session.add(new_user)
            session.commit()
            session.refresh(new_user)

            # 为新用户创建默认世界
            default_world = World(
                user_id=new_user.id,
                name="默认世界",
                greeting_message="欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~"
            )
            session.add(default_world)
            session.commit()

            return {
                "message": f"欢迎加入，{request.username}！",
                "user_id": new_user.id,
                "is_new": True
            }

# 兼容旧接口
@app.post("/set_username/")
async def set_username(request: UsernameRequest):
    return await register_user(request)

@app.get("/api/users/{username}")
async def get_user(username: str):
    """获取用户信息"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户未找到")
        return {
            "id": user.id,
            "username": user.username,
            "created_at": user.created_at
        }

# ==================== 世界配置路由 ====================

@app.get("/api/worlds/{user_id}")
async def get_user_worlds(user_id: int):
    """获取用户的所有世界"""
    with Session(engine) as session:
        worlds = session.exec(select(World).where(World.user_id == user_id)).all()
        return [
            {
                "id": w.id,
                "name": w.name,
                "sky_texture": w.sky_texture,
                "fairy_model": w.fairy_model,
                "background_music": w.background_music,
                "system_prompt": w.system_prompt,
                "greeting_message": w.greeting_message,
                "description": w.description,
                "cover_image": w.cover_image,
                "is_public": w.is_public,
                "view_count": w.view_count or 0,
                "created_at": w.created_at
            }
            for w in worlds
        ]

@app.post("/api/worlds/{user_id}")
async def create_world(user_id: int, request: WorldCreateRequest):
    """创建新世界"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="用户未找到")

        world = World(
            user_id=user_id,
            name=request.name,
            system_prompt=request.system_prompt,
            greeting_message=request.greeting_message
        )
        session.add(world)
        session.commit()
        session.refresh(world)

        return {"message": "世界创建成功", "world_id": world.id}

@app.put("/api/worlds/{world_id}")
async def update_world(world_id: int, request: WorldUpdateRequest):
    """更新世界配置"""
    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        if request.name is not None:
            world.name = request.name
        if request.system_prompt is not None:
            world.system_prompt = request.system_prompt
        if request.greeting_message is not None:
            world.greeting_message = request.greeting_message
        if request.description is not None:
            world.description = request.description
        if request.is_public is not None:
            world.is_public = request.is_public

        world.updated_at = datetime.utcnow()
        session.add(world)
        session.commit()

        return {"message": "世界更新成功"}

@app.delete("/api/worlds/{world_id}")
async def delete_world(world_id: int):
    """删除世界（场景）及其关联的分享记录"""
    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        # 删除关联的分享记录
        shares = session.exec(
            select(WorldShare).where(WorldShare.world_id == world_id)
        ).all()
        for s in shares:
            session.delete(s)

        session.delete(world)
        session.commit()

        return {"message": "场景已删除"}

@app.get("/api/worlds/detail/{world_id}")
async def get_world_detail(world_id: int):
    """获取世界详情"""
    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        return {
            "id": world.id,
            "name": world.name,
            "sky_texture": world.sky_texture,
            "fairy_model": world.fairy_model,
            "background_music": world.background_music,
            "system_prompt": world.system_prompt,
            "greeting_message": world.greeting_message,
            "description": world.description,
            "cover_image": world.cover_image,
            "is_public": world.is_public,
            "view_count": world.view_count or 0,
            "user_id": world.user_id
        }

# ==================== 心声世界场景库路由 ====================

@app.get("/api/worlds/public/list")
async def list_public_worlds(limit: int = 60, offset: int = 0):
    """获取公开的心声场景列表（场景库），按体验次数与创建时间排序"""
    with Session(engine) as session:
        worlds = session.exec(
            select(World)
            .where(World.is_public == True)  # noqa: E712
            .order_by(World.view_count.desc(), World.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()

        # 预取作者用户名
        user_ids = {w.user_id for w in worlds}
        users = session.exec(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
        id_to_name = {u.id: u.username for u in users}

        return [
            {
                "id": w.id,
                "name": w.name,
                "description": w.description,
                "cover_image": w.cover_image,
                "sky_texture": w.sky_texture,
                "author": id_to_name.get(w.user_id, "匿名"),
                "author_id": w.user_id,
                "view_count": w.view_count or 0,
                "created_at": w.created_at,
            }
            for w in worlds
        ]

@app.get("/api/space/{username}")
async def get_user_space(username: str):
    """通过用户名访问其空间：返回用户公开的心声场景列表（用于显式用户名URL）"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户未找到")

        worlds = session.exec(
            select(World)
            .where(World.user_id == user.id, World.is_public == True)  # noqa: E712
            .order_by(World.view_count.desc(), World.created_at.desc())
        ).all()

        return {
            "user_id": user.id,
            "username": user.username,
            "worlds": [
                {
                    "id": w.id,
                    "name": w.name,
                    "description": w.description,
                    "cover_image": w.cover_image,
                    "sky_texture": w.sky_texture,
                    "view_count": w.view_count or 0,
                }
                for w in worlds
            ],
        }

@app.get("/api/worlds/visit/{world_id}")
async def visit_public_world(world_id: int):
    """体验一个公开场景：校验公开状态、累加体验次数并返回完整配置"""
    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="场景未找到")
        if not world.is_public:
            raise HTTPException(status_code=403, detail="该场景未公开")

        world.view_count = (world.view_count or 0) + 1
        session.add(world)

        author = session.get(User, world.user_id)
        session.commit()

        return {
            "id": world.id,
            "name": world.name,
            "description": world.description,
            "cover_image": world.cover_image,
            "sky_texture": world.sky_texture,
            "fairy_model": world.fairy_model,
            "background_music": world.background_music,
            "greeting_message": world.greeting_message,
            "author": author.username if author else "匿名",
            "view_count": world.view_count,
        }

# ==================== 文件上传路由 ====================

def validate_file_type(filename: str, allowed_types: set) -> bool:
    """验证文件类型"""
    ext = os.path.splitext(filename)[1].lower()
    return ext in allowed_types

def save_upload_file(file: UploadFile, user_id: int, file_type: str) -> str:
    """保存上传文件并返回相对路径"""
    ext = os.path.splitext(file.filename)[1].lower()
    unique_filename = f"{user_id}_{file_type}_{uuid.uuid4().hex}{ext}"
    user_dir = os.path.join(settings.UPLOAD_DIR, str(user_id))
    os.makedirs(user_dir, exist_ok=True)

    file_path = os.path.join(user_dir, unique_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return f"{user_id}/{unique_filename}"

@app.post("/api/upload/sky-texture/{world_id}")
async def upload_sky_texture(world_id: int, file: UploadFile = File(...)):
    """上传天空贴图"""
    if not validate_file_type(file.filename, settings.ALLOWED_IMAGE_TYPES):
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        relative_path = save_upload_file(file, world.user_id, "sky")
        world.sky_texture = relative_path
        world.updated_at = datetime.utcnow()

        # 记录上传
        record = UploadRecord(
            user_id=world.user_id,
            world_id=world_id,
            file_type="sky_texture",
            original_filename=file.filename,
            stored_filename=relative_path.split("/")[-1],
            file_path=relative_path,
            file_size=file.size or 0
        )
        session.add(record)
        session.add(world)
        session.commit()

        return {"message": "天空贴图上传成功", "path": f"/uploads/{relative_path}"}

@app.post("/api/upload/fairy-model/{world_id}")
async def upload_fairy_model(world_id: int, file: UploadFile = File(...)):
    """上传精灵模型"""
    if not validate_file_type(file.filename, settings.ALLOWED_MODEL_TYPES):
        raise HTTPException(status_code=400, detail="不支持的模型格式")

    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        relative_path = save_upload_file(file, world.user_id, "fairy")
        world.fairy_model = relative_path
        world.updated_at = datetime.utcnow()

        record = UploadRecord(
            user_id=world.user_id,
            world_id=world_id,
            file_type="fairy_model",
            original_filename=file.filename,
            stored_filename=relative_path.split("/")[-1],
            file_path=relative_path,
            file_size=file.size or 0
        )
        session.add(record)
        session.add(world)
        session.commit()

        return {"message": "精灵模型上传成功", "path": f"/uploads/{relative_path}"}

@app.post("/api/upload/background-music/{world_id}")
async def upload_background_music(world_id: int, file: UploadFile = File(...)):
    """上传背景音乐"""
    if not validate_file_type(file.filename, settings.ALLOWED_AUDIO_TYPES):
        raise HTTPException(status_code=400, detail="不支持的音频格式")

    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        relative_path = save_upload_file(file, world.user_id, "music")
        world.background_music = relative_path
        world.updated_at = datetime.utcnow()

        record = UploadRecord(
            user_id=world.user_id,
            world_id=world_id,
            file_type="background_music",
            original_filename=file.filename,
            stored_filename=relative_path.split("/")[-1],
            file_path=relative_path,
            file_size=file.size or 0
        )
        session.add(record)
        session.add(world)
        session.commit()

        return {"message": "背景音乐上传成功", "path": f"/uploads/{relative_path}"}

@app.post("/api/upload/cover/{world_id}")
async def upload_cover(world_id: int, request: CoverUploadRequest):
    """保存场景封面（来自应用内截图的base64图片）"""
    import base64

    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        data = request.image_base64
        # 解析 data URL 前缀
        if "," in data and data.strip().startswith("data:"):
            header, data = data.split(",", 1)
            ext = ".jpg" if "jpeg" in header or "jpg" in header else ".png"
        else:
            ext = ".png"

        try:
            raw = base64.b64decode(data)
        except Exception:
            raise HTTPException(status_code=400, detail="无效的图片数据")

        unique_filename = f"{world.user_id}_cover_{uuid.uuid4().hex}{ext}"
        user_dir = os.path.join(settings.UPLOAD_DIR, str(world.user_id))
        os.makedirs(user_dir, exist_ok=True)
        file_path = os.path.join(user_dir, unique_filename)
        with open(file_path, "wb") as f:
            f.write(raw)

        relative_path = f"{world.user_id}/{unique_filename}"
        world.cover_image = relative_path
        world.updated_at = datetime.utcnow()
        session.add(world)
        session.commit()

        return {"message": "封面已保存", "path": f"/uploads/{relative_path}"}

@app.post("/api/upload/system-prompt/{world_id}")
async def upload_system_prompt(world_id: int, file: UploadFile = File(...)):
    """上传系统提示词文件"""
    if not validate_file_type(file.filename, settings.ALLOWED_TEXT_TYPES):
        raise HTTPException(status_code=400, detail="不支持的文本格式")

    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        # 读取文件内容
        content = await file.read()
        world.system_prompt = content.decode("utf-8")
        world.updated_at = datetime.utcnow()

        record = UploadRecord(
            user_id=world.user_id,
            world_id=world_id,
            file_type="system_prompt",
            original_filename=file.filename,
            stored_filename=file.filename,
            file_path="",
            file_size=len(content)
        )
        session.add(record)
        session.add(world)
        session.commit()

        return {"message": "系统提示词上传成功"}

# ==================== 聊天路由 ====================

@app.websocket("/ws/chat_with_claude_via_stream/")
async def chat_with_claude_websocket_via_stream(websocket: WebSocket, world_id: Optional[int] = None):
    """WebSocket流式聊天（支持多LLM）"""
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"

    # 获取世界配置
    system_prompt = default_system_prompt
    greeting = "欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~"

    if world_id:
        with Session(engine) as session:
            world = session.get(World, world_id)
            if world:
                if world.system_prompt:
                    system_prompt = world.system_prompt
                if world.greeting_message:
                    greeting = world.greeting_message

    active_conversations[client_id] = [
        {"role": "assistant", "content": greeting}
    ]
    usernames[client_id] = current_username or "Unknown"

    with Session(engine) as session:
        user = session.exec(
            select(User).where(User.username == usernames[client_id])
        ).first()
        if not user:
            user = User(username="Unknown")
            session.add(user)
            session.commit()
            session.refresh(user)

    try:
        while True:
            data = await websocket.receive_json()

            # 心跳消息：回复pong后跳过，避免被当作空对话触发NPC主动说话
            if data.get("type") == "ping":
                await websocket.send_text("pong")
                continue

            user_message = data.get("content", "")
            llm_id = data.get("llm_id")  # 可选的LLM ID
            model = data.get("model")  # 可选的模型名称
            max_tokens = data.get("max_tokens", 2048)

            # 忽略空消息，必须等用户真正输入后才回应
            if not user_message.strip():
                continue

            with Session(engine) as session:
                chat = Chat(user_id=user.id, world_id=world_id, role="user", content=user_message)
                session.add(chat)
                session.commit()

            active_conversations[client_id].append(
                {"role": "user", "content": user_message}
            )

            if not llm_manager.get_available_llms():
                await websocket.send_text("抱歉，聊天服务暂时不可用")
                await websocket.send_text("[END_OF_RESPONSE]")
                continue

            # 使用LLM管理器的流式聊天
            partial_response = ""
            for text in llm_manager.chat_stream(
                messages=active_conversations[client_id],
                system_prompt=system_prompt,
                llm_id=llm_id,
                model=model,
                max_tokens=max_tokens
            ):
                partial_response += text
                await websocket.send_text(text)

            active_conversations[client_id].append(
                {"role": "assistant", "content": partial_response}
            )
            with Session(engine) as session:
                chat = Chat(
                    user_id=user.id, world_id=world_id, role="assistant", content=partial_response
                )
                session.add(chat)
                session.commit()

            await websocket.send_text("[END_OF_RESPONSE]")

    except WebSocketDisconnect:
        print("客户端断开连接")
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)
    except Exception as e:
        print(f"客户端{client_id}发生错误：{e}")
        await websocket.send_text(f"发生错误: {e}")
        await websocket.close()
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)

@app.websocket("/ws/chat_with_claude/")
async def chat_with_claude_websocket(websocket: WebSocket, world_id: Optional[int] = None):
    """WebSocket模拟流式聊天（支持多LLM）"""
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"

    system_prompt = default_system_prompt
    greeting = "欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~"

    if world_id:
        with Session(engine) as session:
            world = session.get(World, world_id)
            if world:
                if world.system_prompt:
                    system_prompt = world.system_prompt
                if world.greeting_message:
                    greeting = world.greeting_message

    active_conversations[client_id] = [
        {"role": "assistant", "content": greeting}
    ]
    usernames[client_id] = current_username or "Unknown"

    with Session(engine) as session:
        user = session.exec(
            select(User).where(User.username == usernames[client_id])
        ).first()
        if not user:
            user = User(username="Unknown")
            session.add(user)
            session.commit()
            session.refresh(user)

    try:
        while True:
            data = await websocket.receive_json()

            # 心跳消息：回复pong后跳过，避免被当作空对话触发NPC主动说话
            if data.get("type") == "ping":
                await websocket.send_text("pong")
                continue

            user_message = data.get("content", "")
            llm_id = data.get("llm_id")  # 可选的LLM ID
            model = data.get("model")  # 可选的模型名称
            max_tokens = data.get("max_tokens", 2048)

            # 忽略空消息，必须等用户真正输入后才回应
            if not user_message.strip():
                continue

            with Session(engine) as session:
                chat = Chat(user_id=user.id, world_id=world_id, role="user", content=user_message)
                session.add(chat)
                session.commit()

            active_conversations[client_id].append(
                {"role": "user", "content": user_message}
            )

            if not llm_manager.get_available_llms():
                await websocket.send_text("抱歉，聊天服务暂时不可用")
                await websocket.send_text("[END_OF_RESPONSE]")
                continue

            # 收集完整响应
            full_response = ""
            for text in llm_manager.chat_stream(
                messages=active_conversations[client_id],
                system_prompt=system_prompt,
                llm_id=llm_id,
                model=model,
                max_tokens=max_tokens
            ):
                full_response += text

            # 模拟流式发送
            word_segments = list(jieba.cut(full_response))
            chunk_size = 6
            chunks = [
                "".join(word_segments[i : i + chunk_size])
                for i in range(0, len(word_segments), chunk_size)
            ]
            for chunk in chunks:
                await websocket.send_text(chunk)
                await asyncio.sleep(0.2)

            active_conversations[client_id].append(
                {"role": "assistant", "content": full_response}
            )
            with Session(engine) as session:
                chat = Chat(user_id=user.id, world_id=world_id, role="assistant", content=full_response)
                session.add(chat)
                session.commit()

            await websocket.send_text("[END_OF_RESPONSE]")

    except WebSocketDisconnect:
        print("客户端断开连接")
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)
    except Exception as e:
        print(f"客户端{client_id}发生错误：{e}")
        await websocket.close()
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)

@app.get("/get_conversations/{username}")
async def get_conversations(username: str):
    """获取用户对话记录"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户未找到")

        chats = session.exec(select(Chat).where(Chat.user_id == user.id)).all()
        return [
            {"role": chat.role, "content": chat.content, "timestamp": chat.timestamp}
            for chat in chats
        ]

# ==================== 反馈路由（预留） ====================

@app.post("/api/feedback")
async def submit_feedback(user_id: int, request: FeedbackRequest):
    """提交反馈"""
    with Session(engine) as session:
        feedback = Feedback(
            user_id=user_id,
            feedback_type=request.feedback_type,
            title=request.title,
            content=request.content
        )
        session.add(feedback)
        session.commit()

        return {"message": "反馈提交成功"}

@app.get("/api/feedback/{user_id}")
async def get_user_feedback(user_id: int):
    """获取用户反馈"""
    with Session(engine) as session:
        feedbacks = session.exec(select(Feedback).where(Feedback.user_id == user_id)).all()
        return [
            {
                "id": f.id,
                "type": f.feedback_type,
                "title": f.title,
                "content": f.content,
                "status": f.status,
                "created_at": f.created_at
            }
            for f in feedbacks
        ]

# ==================== 分享路由（预留） ====================

@app.post("/api/share/{world_id}")
async def share_world(world_id: int):
    """分享世界"""
    with Session(engine) as session:
        world = session.get(World, world_id)
        if not world:
            raise HTTPException(status_code=404, detail="世界未找到")

        # 检查是否已有分享
        existing = session.exec(
            select(WorldShare).where(WorldShare.world_id == world_id)
        ).first()
        if existing:
            return {"share_code": existing.share_code}

        share_code = uuid.uuid4().hex[:8]
        share = WorldShare(world_id=world_id, share_code=share_code)
        session.add(share)

        world.is_public = True
        session.add(world)
        session.commit()

        return {"share_code": share_code}

@app.get("/api/share/world/{world_id}")
async def get_share_by_world(world_id: int):
    """根据世界ID获取分享信息"""
    with Session(engine) as session:
        share = session.exec(
            select(WorldShare).where(WorldShare.world_id == world_id)
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="未找到分享")

        return {
            "share_code": share.share_code,
            "view_count": share.view_count,
            "created_at": share.created_at
        }

@app.get("/api/share/{share_code}")
async def get_shared_world(share_code: str):
    """获取分享的世界"""
    with Session(engine) as session:
        share = session.exec(
            select(WorldShare).where(WorldShare.share_code == share_code)
        ).first()
        if not share:
            raise HTTPException(status_code=404, detail="分享链接无效")

        # 增加访问计数
        share.view_count += 1
        session.add(share)

        world = session.get(World, share.world_id)
        session.commit()

        return {
            "world_id": world.id,
            "name": world.name,
            "sky_texture": world.sky_texture,
            "fairy_model": world.fairy_model,
            "background_music": world.background_music,
            "greeting_message": world.greeting_message,
            "view_count": share.view_count
        }

# ==================== 管理路由 ====================

@app.get("/api/admin/db-info")
async def get_database_info():
    """获取数据库信息"""
    return get_db_info()

@app.post("/api/admin/db-reset")
async def reset_database(confirm: bool = False):
    """重置数据库（危险操作）"""
    if not confirm:
        raise HTTPException(status_code=400, detail="请确认此操作，设置confirm=true")

    reset_db()
    return {"message": "数据库已重置"}

@app.post("/api/admin/db-migrate")
async def migrate_database():
    """数据库迁移（重建表结构）"""
    init_db()
    return {"message": "数据库迁移完成"}

@app.get("/api/admin/upload-records")
async def get_all_upload_records():
    """获取所有上传记录"""
    with Session(engine) as session:
        records = session.exec(select(UploadRecord)).all()
        return [
            {
                "id": r.id,
                "user_id": r.user_id,
                "world_id": r.world_id,
                "file_type": r.file_type,
                "original_filename": r.original_filename,
                "file_path": r.file_path,
                "file_size": r.file_size,
                "uploaded_at": r.uploaded_at
            }
            for r in records
        ]

# ==================== 预留路由占位 ====================

@app.get("/api/my-worlds")
async def my_worlds_placeholder():
    """我的世界 - 功能预留"""
    return {"message": "此功能正在开发中", "status": "placeholder"}

@app.get("/api/explore")
async def explore_worlds_placeholder():
    """探索世界 - 功能预留"""
    return {"message": "此功能正在开发中", "status": "placeholder"}

@app.post("/api/auth/forgot-password")
async def forgot_password_placeholder():
    """忘记密码 - 功能预留（当前系统无密码）"""
    return {"message": "当前系统不需要密码", "status": "placeholder"}

# ==================== LLM路由 ====================

@app.get("/api/llms")
async def get_available_llms():
    """获取可用的LLM列表"""
    return llm_manager.get_available_llms()

@app.get("/api/llms/default")
async def get_default_llm():
    """获取默认LLM"""
    config = llm_manager.get_config()
    if not config:
        raise HTTPException(status_code=404, detail="没有可用的LLM")
    return {
        'id': config.id,
        'name': config.name,
        'default_model': config.default_model,
        'models': config.models
    }

@app.post("/api/llms/test/{llm_id}")
async def test_llm(llm_id: str):
    """测试指定LLM是否可用"""
    config = llm_manager.get_config(llm_id)
    if not config:
        raise HTTPException(status_code=404, detail=f"LLM {llm_id} 未找到")

    try:
        # 发送简单测试消息
        response_text = ""
        for text in llm_manager.chat_stream(
            messages=[{"role": "user", "content": "请回复'你好'两个字"}],
            system_prompt="你是一个测试助手，请简短回复。",
            llm_id=llm_id,
            max_tokens=50
        ):
            response_text += text

        return {
            "status": "success",
            "llm_id": llm_id,
            "llm_name": config.name,
            "response": response_text[:100]  # 截取前100字符
        }
    except Exception as e:
        return {
            "status": "error",
            "llm_id": llm_id,
            "llm_name": config.name,
            "error": str(e)
        }

# ==================== 健康检查 ====================

@app.get("/health")
async def health_check():
    """健康检查"""
    available_llms = llm_manager.get_available_llms()
    return {
        "status": "healthy",
        "database": get_db_info(),
        "llm_available": len(available_llms) > 0,
        "available_llms": [llm['id'] for llm in available_llms],
        "default_llm": llm_manager.default_llm_id
    }


_frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(_frontend_dir, "index.html"))

@app.get("/u/{username}")
@app.get("/u/{username}/{world_id}")
async def serve_user_space(username: str, world_id: Optional[int] = None):
    """显式用户名空间页面：用户不存在或无公开场景时返回真正的404"""
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail=f"用户 {username} 不存在")

        public_worlds = session.exec(
            select(World).where(
                World.user_id == user.id, World.is_public == True  # noqa: E712
            )
        ).all()
        if not public_worlds:
            raise HTTPException(status_code=404, detail=f"{username} 还没有公开的心声场景")

        # 指定了场景ID时，校验该场景属于此用户且为公开
        if world_id is not None and not any(w.id == world_id for w in public_worlds):
            raise HTTPException(status_code=404, detail="该场景不存在或未公开")

    return FileResponse(os.path.join(_frontend_dir, "index.html"))

@app.get("/{path:path}")
async def serve_static(path: str):
    file_path = os.path.join(_frontend_dir, path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(_frontend_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8225)
