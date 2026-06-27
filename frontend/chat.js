let socket;
let conversation = []; // 存储当前对话的上下文
let currentLlmId = null; // 当前选择的LLM ID（null表示使用默认）
let heartbeatInterval = null; // 心跳定时器
let reconnectAttempts = 0; // 重连次数
const MAX_RECONNECT_ATTEMPTS = 5; // 最大重连次数
let isManualClose = false; // 是否手动关闭

function connectWebSocket() {
    // 如果已经连接，不重复连接
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket已连接，无需重连");
        return;
    }

    // 获取当前世界ID以应用正确的system_prompt
    const worldId = window.currentWorldId;
    const worldIdParam = worldId ? `?world_id=${worldId}` : '';

    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${wsProto}://${window.location.host}/ws/chat_with_claude/${worldIdParam}`);

    socket.onopen = function () {
        console.log("WebSocket连接已建立");
        reconnectAttempts = 0; // 重置重连次数
        isManualClose = false;
        startHeartbeat();
    };

    socket.onmessage = function (event) {
        // 忽略心跳响应
        if (event.data === "pong") return;

        if (event.data === "[END_OF_RESPONSE]") {
            let lastDialogue = document.getElementsByClassName('companion-dialogue-active')[0];
            if (lastDialogue) {
                lastDialogue.classList.remove('companion-dialogue-active');
                lastDialogue.classList.add('companion-dialogue-finished');
            }
        } else {
            let lastDialogue = document.getElementsByClassName('companion-dialogue-active')[0];
            const dialogueContent = document.getElementById('dialogue-content');

            if (!lastDialogue) {
                lastDialogue = document.createElement('div');
                lastDialogue.classList.add('dialogue-entry', 'companion-dialogue', 'companion-dialogue-active');
                dialogueContent.appendChild(lastDialogue);
            }

            lastDialogue.innerHTML += event.data;
            dialogueContent.scrollTop = dialogueContent.scrollHeight;
        }
    };

    socket.onclose = function (event) {
        console.log("WebSocket连接已关闭", event.code, event.reason);
        stopHeartbeat();

        // 如果不是手动关闭，尝试自动重连
        if (!isManualClose && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = Math.min(1000 * reconnectAttempts, 5000); // 递增延迟，最多5秒
            console.log(`将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连...`);
            setTimeout(connectWebSocket, delay);
        }
    };

    socket.onerror = function (error) {
        console.error("WebSocket发生错误:", error);
    };
}

// 心跳机制，保持连接活跃
function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
        }
    }, 30000); // 每30秒发送一次心跳
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// 展示开场白
function renderOpeningDialogue() {
    // 优先使用自定义的greeting，如果没有则使用默认文本
    const defaultGreeting = "欢迎来到这片充满魔法的森林！(^_^) 我是森林精灵絮语，很高兴遇见你~ 这里是一个可以分享任何心事的安全港湾，让我们一起探索这片充满治愈力量的地方吧！";
    const openingText = window.customGreeting || defaultGreeting;

    const dialogueContent = document.getElementById("dialogue-content");
    const openingDialogue = document.createElement('div');
    openingDialogue.id = 'opening-dialogue';
    openingDialogue.classList.add('dialogue-entry', 'companion-dialogue', 'companion-dialogue-finished');
    openingDialogue.innerHTML = openingText;
    dialogueContent.appendChild(openingDialogue);
    dialogueContent.scrollTop = dialogueContent.scrollHeight;
}

// 更新开场白（用于设置保存后）- 暴露到全局以便world-config.js调用
window.updateOpeningDialogue = function(newGreeting) {
    const openingDialogue = document.getElementById('opening-dialogue');
    if (openingDialogue && newGreeting) {
        openingDialogue.innerHTML = newGreeting;
        console.log("开场白已更新");
    }
};

// 重新连接WebSocket（用于system_prompt更新后）- 暴露到全局以便world-config.js调用
window.reconnectWebSocket = function() {
    if (socket) {
        isManualClose = true; // 标记为手动关闭，避免触发自动重连
        socket.close();
    }
    // 短暂延迟后重新连接
    setTimeout(() => {
        reconnectAttempts = 0; // 重置重连次数
        connectWebSocket();
        console.log("WebSocket已重新连接以应用新的系统提示词");
    }, 500);
};

// 渲染用户对话
function renderUserDialogue(text) {
    const dialogueContent = document.getElementById('dialogue-content');
    const userDialogue = document.createElement('div');
    userDialogue.classList.add('dialogue-entry', 'user-dialogue');
    userDialogue.innerHTML = text;
    dialogueContent.appendChild(userDialogue);
    dialogueContent.scrollTop = dialogueContent.scrollHeight;
}

// 发送用户消息给WebSocket服务器
function sendUserMessage() {
    const inputBox = document.getElementById('input-box');
    const userText = inputBox.value.trim();
    if (userText !== "") {
        renderUserDialogue(userText);

        conversation.push({ role: "user", content: userText });
        const requestData = {
            content: userText,
            llm_id: currentLlmId  // 使用选择的LLM
        };

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(requestData));
        } else {
            console.error("WebSocket未连接，无法发送消息");
        }

        inputBox.value = "";
        document.getElementById('dialogue-content').scrollTop = document.getElementById('dialogue-content').scrollHeight;
    }
}

document.getElementById('send-button').addEventListener('click', () => {
    sendUserMessage();
});

document.getElementById('input-box').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendUserMessage();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    // 延迟渲染开场白，等待world-config.js设置customGreeting
    setTimeout(() => {
        renderOpeningDialogue();
    }, 800);

    const usernameModal = document.getElementById("username-modal");
    const usernameInput = document.getElementById("username-input");
    const submitButton = document.getElementById("submit-username");
    const cancelUsernameBtn = document.getElementById('cancel-username');

    // 检查用户是否已登录，如果没有则显示登录弹窗
    const savedUsername = localStorage.getItem("username");
    if (!savedUsername) {
        usernameModal.style.display = 'flex';
    }

    cancelUsernameBtn.addEventListener('click', function () {
        // 隐藏弹窗
        usernameModal.style.display = 'none';
    });
    submitButton.addEventListener("click", async () => {
        const username = usernameInput.value.trim();
        if (username) {
            try {
                let url = `${window.location.origin}/set_username/`;
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ username })
                });

                if (!response.ok) {
                    throw new Error(`请求失败，状态码: ${response.status}`);
                }

                const result = await response.json();
                console.log("API 执行结果:", result);

                usernameModal.style.display = "none";
                localStorage.setItem("username", username);
            } catch (error) {
                console.error("用户名设置失败:", error);
                alert("无法设置用户名，请重试。");
            }
        } else {
            alert("请输入用户名");
        }
    });
});

// 延迟连接WebSocket，等待世界配置加载完成
// 如果world-config.js在1秒内设置了currentWorldId，则使用它连接
// 否则使用默认配置连接
setTimeout(() => {
    connectWebSocket();
}, 1000);
