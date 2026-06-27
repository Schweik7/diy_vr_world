# 后端 - 使用 FastAPI
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import keyring
from anthropic import Anthropic, DefaultHttpxClient
import httpx
import json
from typing import List, Dict
import asyncio

# 加载环境变量
load_dotenv()

# 获取 API 密钥
api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    api_key = keyring.get_password("anthropic_api", "ANTHROPIC_API_KEY")

if not api_key:
    raise ValueError("无法获取API密钥。请确保已正确设置。")

# 创建Anthropic客户端
client = Anthropic(
    http_client=DefaultHttpxClient(
        proxies="http://127.0.0.1:10809",
        transport=httpx.HTTPTransport(local_address="0.0.0.0"),
    ),
    api_key=api_key,
)

# 对话消息模型
class Message(BaseModel):
    role: str
    content: str

class ConversationRequest(BaseModel):
    messages: List[Message]
    model: str = "claude-3-5-sonnet-20240620"
    max_tokens: int = 1024

# 对话记录保存路径
conversation_log_path = "conversation_log.json"

# 初始化对话记录文件
if not os.path.exists(conversation_log_path):
    with open(conversation_log_path, 'w') as file:
        json.dump([], file,ensure_ascii=False)

# 控制台版实现 - Claude多轮流输出（流式输出版）
async def console_chat_with_claude():
    active_conversations: List[Dict] = []
    try:
        while True:
            # 接收用户输入
            user_message = input("You: ")
            if user_message.lower() in ["exit", "quit"]:
                print("Exiting chat...")
                break

            # 将用户消息添加到会话上下文中
            active_conversations.append({"role": "user", "content": user_message})
            
            # 调用Anthropic API与Claude进行多轮对话，使用流式传输
            with client.messages.stream(
                model="claude-3-5-sonnet-20240620",
                max_tokens=1024,
                messages=active_conversations,
            ) as stream:
                # 逐步输出Claude的回复（同步方式）
                print("Claude:", end=" ")
                for text in stream.text_stream:
                    print(text, end="", flush=True)
                    # 将Claude的回复逐步添加到会话上下文中
                    active_conversations.append({"role": "assistant", "content": text})
                print()  # 换行

    except Exception as e:
        print(f"发生错误: {e}")
        raise e
# 如果直接运行该脚本，则启动控制台聊天
if __name__ == "__main__":
    asyncio.run(console_chat_with_claude())
