# 心灵絮语 - 魔法森林AI陪伴

一个基于A-Frame VR和Claude AI的沉浸式心理陪伴应用。

## 项目简介

- 前端使用 A-Frame 框架 + ES6 语法构建3D沉浸式体验
- 后端使用 FastAPI + SQLModel 提供API服务
- 支持用户自定义世界：天空贴图、精灵模型、背景音乐、AI人格设定

## 功能特性

- **AI精灵陪伴**：与Claude驱动的精灵进行情感对话
- **自定义世界**：上传自己的天空背景、3D模型、背景音乐
- **精灵人格设定**：自定义system_prompt和初次见面语
- **用户系统**：简易用户系统，支持保存个人世界配置
- **分享功能**：可将自己的世界分享给他人（预留）
- **意见反馈**：支持功能建议和bug反馈（预留）

## 快速开始

### 环境要求

- Python 3.8+
- 现代浏览器（Chrome、Firefox、Edge等）

### Linux / macOS

```bash
# 1. 安装系统依赖（以Ubuntu/Debian为例）
sudo apt install python3-pip sqlite3

# 2. 设置pip源（可选，加速下载）
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
pip config set install.trusted-host pypi.tuna.tsinghua.edu.cn

# 3. 安装Python依赖
pip3 install -r ./backend/requirements.txt

# 4. 设置环境变量（创建.env文件或导出）
export ANTHROPIC_API_KEY="your-api-key"
# 或在 backend/.env 文件中添加：
# ANTHROPIC_API_KEY=your-api-key

# 5. 启动后端（终端1）
cd backend
fastapi dev app.py
# 或使用 uvicorn:
# uvicorn app:app --reload --host 0.0.0.0 --port 8000

# 6. 启动前端（终端2）
cd frontend
python3 -m http.server 5500
```

### Windows

```powershell
# 1. 确保已安装Python 3.8+
# 下载地址: https://www.python.org/downloads/

# 2. 设置pip源（可选，加速下载）
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
pip config set install.trusted-host pypi.tuna.tsinghua.edu.cn

# 3. 安装Python依赖
pip install -r .\backend\requirements.txt

# 4. 设置环境变量
# 方法1: 在 backend\.env 文件中添加：
# ANTHROPIC_API_KEY=your-api-key
# 方法2: PowerShell临时设置：
$env:ANTHROPIC_API_KEY="your-api-key"

# 5. 启动后端（终端1）
cd backend
fastapi dev app.py
# 或使用 uvicorn:
# uvicorn app:app --reload --host 0.0.0.0 --port 8000

# 6. 启动前端（终端2）
cd frontend
python -m http.server 5500
```

### 访问应用

启动成功后，在浏览器中访问：http://localhost:5500

## 数据库配置

默认使用SQLite数据库，支持通过环境变量配置MySQL。

```bash
# SQLite（默认）
DATABASE_URL=sqlite:///./chat_database.db

# MySQL
DATABASE_URL=mysql+pymysql://user:password@localhost:3306/xinlingxuyu
```

### 数据库管理

```bash
# 查看数据库信息
curl http://localhost:8000/api/admin/db-info

# 数据库迁移（更新表结构）
curl -X POST http://localhost:8000/api/admin/db-migrate

# 重置数据库（危险操作，需确认）
curl -X POST "http://localhost:8000/api/admin/db-reset?confirm=true"
```

## 运行测试

```bash
cd backend
pytest tests/test_api.py -v
```

## API文档

启动后端后，访问以下地址查看API文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 主要API端点

### 用户相关
- `POST /api/users/register` - 用户注册/登录
- `GET /api/users/{username}` - 获取用户信息

### 世界配置
- `GET /api/worlds/{user_id}` - 获取用户的世界列表
- `POST /api/worlds/{user_id}` - 创建新世界
- `PUT /api/worlds/{world_id}` - 更新世界配置
- `GET /api/worlds/detail/{world_id}` - 获取世界详情

### 文件上传
- `POST /api/upload/sky-texture/{world_id}` - 上传天空贴图
- `POST /api/upload/fairy-model/{world_id}` - 上传精灵模型
- `POST /api/upload/background-music/{world_id}` - 上传背景音乐
- `POST /api/upload/system-prompt/{world_id}` - 上传系统提示词

### 聊天
- `WebSocket /ws/chat_with_claude/` - WebSocket聊天
- `WebSocket /ws/chat_with_claude_via_stream/` - 流式聊天
- `GET /get_conversations/{username}` - 获取对话记录

### 反馈（预留）
- `POST /api/feedback` - 提交反馈
- `GET /api/feedback/{user_id}` - 获取用户反馈

### 分享（预留）
- `POST /api/share/{world_id}` - 分享世界
- `GET /api/share/{share_code}` - 获取分享的世界

## 项目结构

```
心灵絮语/
├── backend/
│   ├── app.py              # 主应用（新）
│   ├── config.py           # 配置模块
│   ├── models.py           # 数据库模型
│   ├── claude_chat.py      # 原有入口（保留兼容）
│   ├── requirements.txt    # Python依赖
│   ├── system_prompt.md    # 中文系统提示词
│   ├── system_prompt_en.md # 英文系统提示词
│   ├── uploads/            # 上传文件目录
│   └── tests/
│       └── test_api.py     # API测试
├── frontend/
│   ├── index.html          # 主页面
│   ├── style.css           # 样式
│   ├── chat.js             # 聊天功能
│   ├── world-config.js     # 世界配置模块（新）
│   ├── component.js        # A-Frame组件
│   └── *.gltf/glb          # 3D模型文件
└── readme.md               # 项目说明
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | 数据库连接URL | `sqlite:///./chat_database.db` |
| `ANTHROPIC_API_KEY` | Claude API密钥 | - |
| `ENV` | 运行环境 | `development` |
| `PROXY_URL` | 代理地址（开发环境） | `http://127.0.0.1:10809` |
| `UPLOAD_DIR` | 上传文件目录 | `./uploads` |
| `MAX_UPLOAD_SIZE` | 最大上传大小 | `52428800` (50MB) |

## 开发计划（预留功能）

- [ ] 我的世界 - 管理已创建的世界
- [ ] 分享我的世界 - 生成分享链接
- [ ] 意见反馈 - 功能建议和bug反馈
- [ ] 忘记密码 - 当前系统无密码
- [ ] 登录路由保护 - 需要登录才能访问的页面

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License
