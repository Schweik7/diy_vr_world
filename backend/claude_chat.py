from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import keyring
from anthropic import Anthropic, DefaultHttpxClient
import httpx
from typing import List, Dict, Optional
from datetime import datetime
from sqlmodel import Field, SQLModel, create_engine, Session, select
from pydantic import BaseModel
import jieba
import asyncio
import time
#  fastapi dev .\backend\claude_chat.py


class UsernameRequest(BaseModel):
    username: str


os.chdir(os.path.dirname(__file__))  # 设置工作目录
# 加载环境变量
load_dotenv()

# 获取 API 密钥
api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    api_key = keyring.get_password("anthropic_api", "ANTHROPIC_API_KEY")

if not api_key:
    raise ValueError("无法获取API密钥。请确保已正确设置。")
# 根据环境配置Anthropic客户端
environment = os.getenv("ENV", "development")  # 默认是开发环境
if environment == "production":
    # 生产环境 - 不需要DefaultHttpxClient
    client = Anthropic(api_key=api_key)
    print("已连接到生产环境")
else:
    # 开发环境 - 使用DefaultHttpxClient配置代理和本地绑定
    client = Anthropic(
        http_client=DefaultHttpxClient(
            proxies="http://127.0.0.1:10809",
            transport=httpx.HTTPTransport(local_address="0.0.0.0"),
        ),
        api_key=api_key,
    )
    print("已连接到开发环境")


# 配置 SQLite 数据库
DATABASE_URL = "sqlite:///./chat_database.db"
engine = create_engine(DATABASE_URL)


# 定义数据库模型
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Chat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# 初始化数据库
SQLModel.metadata.create_all(engine)


# 定义检测Claude连接的函数
def check_claude_connection():
    test_message = [{"role": "user", "content": "1 + 1"}]
    try:
        # 发送测试问题
        response = client.messages.create(
            messages=test_message, model="claude-3-5-sonnet-20240620", max_tokens=1024
        )
        if "2" in response.content[0].text:
            print("Claude 连接测试成功：返回正确答案。")
        else:
            print("Claude 连接测试失败：未返回正确答案。")
    except Exception as e:
        print(f"无法连接到Claude：{e}")


# 初始化 FastAPI 应用
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 存储每个WebSocket连接的会话上下文
active_conversations: Dict[str, List[Dict]] = {}
usernames: Dict[str, str] = {}
current_username: str = None
# 读取 system_prompt.js 的内容
with open("system_prompt_en.md", "r", encoding="utf-8") as file:
    system_prompt = file.read().strip()


@app.post("/set_username/")
async def set_username(request: UsernameRequest):
    username = request.username  # 从请求体中获取 username 字段
    global current_username
    current_username = username
    with Session(engine) as session:
        # 查询是否已有相同用户名的用户
        existing_user = session.exec(
            select(User).where(User.username == username)
        ).first()
        if existing_user:
            # 用户名已存在，返回现有用户信息
            return {
                "message": f"用户名 {username} 已存在",
                "user_id": existing_user.id,
                "new_user": False,
            }
        else:
            # 用户名不存在，创建新用户
            new_user = User(username=username)
            session.add(new_user)
            session.commit()
            session.refresh(new_user)
            return {
                "message": f"用户名 {username} 已设置",
                "user_id": new_user.id,
                "new_user": True,
            }


# 定义WebSocket端点，用于流式传输Claude的回复
@app.websocket("/ws/chat_with_claude_via_stream/")
async def chat_with_claude_websocket_via_stream(websocket: WebSocket):
    await websocket.accept()
    client_id = str(websocket.client.host) + ":" + str(websocket.client.port)
    active_conversations[client_id] = [
        {
            "role": "assistant",
            "content": "欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~ 这里是一个可以分享任何心事的安全港湾，让我们一起探索这片充满治愈力量的地方吧！",
        }
    ]
    if current_username:
        usernames[client_id] = current_username
    else:
        usernames[client_id] = "Unknown"  # 默认用户名

    with Session(engine) as session:
        # 检查用户是否存在，若不存在则创建默认用户
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
            # 接收来自客户端的消息
            data = await websocket.receive_json()
            user_message = data.get("content", "")
            model = data.get("model", "claude-3-5-sonnet-20240620")
            max_tokens = data.get("max_tokens", 2048)

            # 将用户消息保存到数据库
            with Session(engine) as session:
                chat = Chat(user_id=user.id, role="user", content=user_message)
                session.add(chat)
                session.commit()

            # 将用户消息添加到会话上下文中
            active_conversations[client_id].append(
                {"role": "user", "content": user_message}
            )

            # 调用Anthropic API与Claude进行多轮对话，使用流式传输
            with client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,  # 这是一个比较长的系统指令
                messages=active_conversations[client_id],
            ) as stream:
                partial_response = ""
                for text in stream.text_stream:
                    partial_response += text
                    await websocket.send_text(text)  # 实时发送Claude的部分回复
                print(text)
                # 将完整的Claude回复添加到会话上下文中并保存到数据库
                active_conversations[client_id].append(
                    {"role": "assistant", "content": partial_response}
                )
                with Session(engine) as session:
                    chat = Chat(
                        user_id=user.id, role="assistant", content=partial_response
                    )
                    session.add(chat)
                    session.commit()

                # 通知前端本轮对话已完成
                await websocket.send_text("[END_OF_RESPONSE]")
                print(f"客户端{client_id}的对话已完成")

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
        raise e


@app.websocket("/ws/chat_with_claude/")
async def chat_with_claude_websocket(websocket: WebSocket):
    await websocket.accept()
    print(f"time1:{time.time()}")
    client_id = str(websocket.client.host) + ":" + str(websocket.client.port)
    active_conversations[client_id] = [
        {
            "role": "assistant",
            "content": "欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~ 这里是一个可以分享任何心事的安全港湾，让我们一起探索这片充满治愈力量的地方吧！",
        }
    ]
    if current_username:
        usernames[client_id] = current_username
    else:
        usernames[client_id] = "Unknown"  # 默认用户名

    with Session(engine) as session:
        # 检查用户是否存在，若不存在则创建默认用户
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
            # 接收来自客户端的消息
            data = await websocket.receive_json()

            user_message = data.get("content", "")
            model = data.get("model", "claude-3-5-sonnet-20240620")
            max_tokens = data.get("max_tokens", 2048)

            # 将用户消息保存到数据库
            with Session(engine) as session:
                chat = Chat(user_id=user.id, role="user", content=user_message)
                session.add(chat)
                session.commit()

            # 将用户消息添加到会话上下文中
            active_conversations[client_id].append(
                {"role": "user", "content": user_message}
            )

            # 调用Claude的message API获取完整回复
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=active_conversations[client_id],
            )
            full_response = response.content[0].text

            # 使用jieba分词，并将结果分成指定词组长度，模拟流式传输
            word_segments = list(jieba.cut(full_response))
            chunk_size = 6  # 每次发送的词组数量，可以根据需求调整
            chunks = [
                "".join(word_segments[i : i + chunk_size])
                for i in range(0, len(word_segments), chunk_size)
            ]
            # 逐段发送Claude的回复，模拟流式传输效果
            for chunk in chunks:
                await websocket.send_text(chunk)
                await asyncio.sleep(0.2)  # 添加100毫秒的延时，可以根据需求调整

            # 将完整的Claude回复添加到会话上下文中并保存到数据库
            active_conversations[client_id].append(
                {"role": "assistant", "content": full_response}
            )
            with Session(engine) as session:
                chat = Chat(user_id=user.id, role="assistant", content=full_response)
                session.add(chat)
                session.commit()

            # 通知前端本轮对话已完成
            await websocket.send_text("[END_OF_RESPONSE]")
            print(f"客户端{client_id}的对话已完成")

    except WebSocketDisconnect:
        print("客户端断开连接")
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)
    except Exception as e:
        print(f"客户端{client_id}发生错误：{e}")
        await websocket.close()
        active_conversations.pop(client_id, None)
        usernames.pop(client_id, None)
        raise e


# 获取对话记录
@app.get("/get_conversations/{username}")
async def get_conversations(username: str):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户未找到")

        chats = session.exec(select(Chat).where(Chat.user_id == user.id)).all()
        return [
            {"role": chat.role, "content": chat.content, "timestamp": chat.timestamp}
            for chat in chats
        ]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
