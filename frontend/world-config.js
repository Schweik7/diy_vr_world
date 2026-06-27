/**
 * 世界配置模块 - 用户可以上传自定义资源
 */

class WorldConfig {
    constructor() {
        this.apiBase = this.getApiBase();
        this.currentWorldId = null;
        this.currentUserId = null;
        this.availableLlms = [];
    }

    getApiBase() {
        return window.location.origin;
    }

    async init() {
        // 加载可用的LLM列表
        await this.loadAvailableLlms();

        // 从localStorage获取用户信息
        const username = localStorage.getItem("username");
        if (username) {
            await this.loadUserData(username);
        } else {
            // 没有登录时，显示默认场景
            this.showDefaultScene();
        }
        this.setupEventListeners();
    }

    showDefaultScene() {
        // 等待场景加载完成后显示默认元素
        const scene = document.querySelector('a-scene');
        const showDefaults = () => {
            const sky = document.querySelector('#sky');
            const fairy = document.querySelector('#fairy');
            if (sky) sky.setAttribute('visible', 'true');
            if (fairy) {
                // 加载默认模型
                fairy.setAttribute('gltf-model', '#fairyModel');
                fairy.addEventListener('model-loaded', () => {
                    fairy.setAttribute('visible', 'true');
                }, { once: true });
            }
        };

        if (scene && scene.hasLoaded) {
            showDefaults();
        } else if (scene) {
            scene.addEventListener('loaded', showDefaults, { once: true });
        }
    }

    async loadAvailableLlms() {
        try {
            const response = await fetch(`${this.apiBase}/api/llms`);
            if (response.ok) {
                this.availableLlms = await response.json();
                this.renderLlmSelector();
                console.log("可用LLM列表:", this.availableLlms);
            }
        } catch (error) {
            console.error("加载LLM列表失败:", error);
        }
    }

    renderLlmSelector() {
        const container = document.getElementById('llm-selector-container');
        if (!container || this.availableLlms.length === 0) return;

        const select = document.getElementById('llm-selector');
        if (!select) return;

        // 清空现有选项
        select.innerHTML = '';

        // 添加LLM选项
        this.availableLlms.forEach(llm => {
            const option = document.createElement('option');
            option.value = llm.id;
            option.textContent = llm.name + (llm.is_default ? ' (默认)' : '');
            if (llm.is_default) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // 监听选择变化
        select.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            // 更新全局LLM ID
            if (typeof currentLlmId !== 'undefined') {
                window.currentLlmId = selectedId;
            }
            console.log("已选择LLM:", selectedId);
            // 重置测试状态
            const statusEl = document.getElementById('llm-test-status');
            if (statusEl) statusEl.textContent = '';
        });

        // 绑定测试按钮事件
        const testBtn = document.getElementById('test-llm-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testSelectedLlm());
        }

        // 显示容器
        container.style.display = 'block';
    }

    async testSelectedLlm() {
        const select = document.getElementById('llm-selector');
        const statusEl = document.getElementById('llm-test-status');
        const testBtn = document.getElementById('test-llm-btn');

        if (!select || !statusEl) return;

        const llmId = select.value;
        statusEl.textContent = '测试中...';
        statusEl.style.color = '#7ec8e3';
        if (testBtn) testBtn.disabled = true;

        try {
            const response = await fetch(`${this.apiBase}/api/llms/test/${llmId}`, {
                method: 'POST'
            });
            const result = await response.json();

            if (result.status === 'success') {
                statusEl.textContent = `✓ ${result.llm_name} 连接正常`;
                statusEl.style.color = '#4ade80';
            } else {
                statusEl.textContent = `✗ 连接失败: ${result.error}`;
                statusEl.style.color = '#f87171';
            }
        } catch (error) {
            statusEl.textContent = `✗ 测试失败: ${error.message}`;
            statusEl.style.color = '#f87171';
        } finally {
            if (testBtn) testBtn.disabled = false;
        }
    }

    async loadUserData(username) {
        try {
            const response = await fetch(`${this.apiBase}/api/users/${username}`);
            if (response.ok) {
                const user = await response.json();
                this.currentUserId = user.id;
                await this.loadUserWorlds(user.id);
            } else {
                // 用户不存在，显示默认场景
                this.showDefaultScene();
            }
        } catch (error) {
            console.error("加载用户数据失败:", error);
            // 加载失败，显示默认场景
            this.showDefaultScene();
        }
    }

    async loadUserWorlds(userId) {
        try {
            const response = await fetch(`${this.apiBase}/api/worlds/${userId}`);
            if (response.ok) {
                const worlds = await response.json();
                this.worlds = worlds;
                if (worlds.length > 0) {
                    this.currentWorldId = worlds[0].id;
                    this.currentWorld = worlds[0];
                    window.currentWorldId = worlds[0].id;  // 暴露给chat.js使用
                    this.applyWorldConfig(worlds[0]);
                } else {
                    // 用户没有世界，显示默认场景
                    this.showDefaultScene();
                }
            } else {
                // 请求失败，显示默认场景
                this.showDefaultScene();
            }
        } catch (error) {
            console.error("加载世界配置失败:", error);
            // 加载失败，显示默认场景
            this.showDefaultScene();
        }
    }

    applyWorldConfig(world) {
        // 等待场景加载完成后再应用配置
        const scene = document.querySelector('a-scene');
        if (scene && scene.hasLoaded) {
            this._applyWorldConfigInternal(world);
        } else if (scene) {
            scene.addEventListener('loaded', () => {
                this._applyWorldConfigInternal(world);
            }, { once: true });
        }
    }

    _applyWorldConfigInternal(world) {
        // 应用天空贴图
        if (world.sky_texture) {
            this.updateSkyTexture(`${this.apiBase}/uploads/${world.sky_texture}`);
        } else {
            // 没有自定义，显示默认
            const sky = document.querySelector('#sky');
            if (sky) sky.setAttribute('visible', 'true');
        }

        // 应用身外化身模型
        if (world.fairy_model) {
            this.updateFairyModel(`${this.apiBase}/uploads/${world.fairy_model}`);
        } else {
            // 没有自定义，加载并显示默认模型
            const fairy = document.querySelector('#fairy');
            if (fairy) {
                fairy.setAttribute('gltf-model', '#fairyModel');
                fairy.addEventListener('model-loaded', () => {
                    fairy.setAttribute('visible', 'true');
                }, { once: true });
            }
        }

        // 应用背景音乐
        if (world.background_music) {
            const musicEl = document.querySelector('#background-music');
            if (musicEl) {
                musicEl.src = `${this.apiBase}/uploads/${world.background_music}`;
            }
        }

        // 应用开场白
        if (world.greeting_message) {
            window.customGreeting = world.greeting_message;
        }
    }

    setupEventListeners() {
        // 设置面板打开按钮
        const configBtn = document.getElementById('config-button');
        if (configBtn) {
            configBtn.addEventListener('click', () => this.openConfigPanel());
        }

        // 设置面板关闭按钮
        const closeBtn = document.getElementById('close-config');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeConfigPanel());
        }

        // 文件上传事件
        this.setupUploadListeners();
    }

    setupCenterListeners() {
        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };
        bind('profile-button', () => this.openProfile());
        bind('close-profile', () => this.closeModal('profile-modal'));
        bind('create-scene-btn', () => this.createScene());
        bind('library-button', () => this.openLibrary());
        bind('close-library', () => this.closeModal('library-modal'));
        bind('save-scene-meta', () => this.saveSceneMeta());
    }

    closeModal(id) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    }

    setupUploadListeners() {
        // 天空贴图上传
        const skyInput = document.getElementById('sky-texture-input');
        if (skyInput) {
            skyInput.addEventListener('change', (e) => this.uploadFile(e, 'sky-texture'));
        }

        // 精灵模型上传
        const fairyInput = document.getElementById('fairy-model-input');
        if (fairyInput) {
            fairyInput.addEventListener('change', (e) => this.uploadFile(e, 'fairy-model'));
        }

        // 背景音乐上传
        const musicInput = document.getElementById('music-input');
        if (musicInput) {
            musicInput.addEventListener('change', (e) => this.uploadFile(e, 'background-music'));
        }

        // 系统提示词上传
        const promptInput = document.getElementById('prompt-input');
        if (promptInput) {
            promptInput.addEventListener('change', (e) => this.uploadFile(e, 'system-prompt'));
        }

        // 文本表单保存
        const saveGreetingBtn = document.getElementById('save-greeting');
        if (saveGreetingBtn) {
            saveGreetingBtn.addEventListener('click', () => this.saveGreeting());
        }

        const savePromptTextBtn = document.getElementById('save-prompt-text');
        if (savePromptTextBtn) {
            savePromptTextBtn.addEventListener('click', () => this.savePromptText());
        }
    }

    async uploadFile(event, fileType) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentWorldId) {
            alert("请先登录");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const statusEl = document.getElementById(`${fileType}-status`);
        if (statusEl) statusEl.textContent = "上传中...";

        try {
            const response = await fetch(
                `${this.apiBase}/api/upload/${fileType}/${this.currentWorldId}`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            if (response.ok) {
                const result = await response.json();
                if (statusEl) statusEl.textContent = "上传成功!";

                // 立即应用更改
                this.applyUploadedFile(fileType, result.path);

                setTimeout(() => {
                    if (statusEl) statusEl.textContent = "";
                }, 3000);
            } else {
                const error = await response.json();
                if (statusEl) statusEl.textContent = `错误: ${error.detail}`;
            }
        } catch (error) {
            console.error("上传失败:", error);
            if (statusEl) statusEl.textContent = "上传失败";
        }
    }

    applyUploadedFile(fileType, path) {
        const fullPath = `${this.apiBase}${path}`;
        console.log(`应用上传文件: ${fileType} -> ${fullPath}`);

        switch (fileType) {
            case 'sky-texture':
                this.updateSkyTexture(fullPath);
                break;

            case 'fairy-model':
                console.log('准备更新身外化身模型...');
                this.updateFairyModel(fullPath);
                break;

            case 'background-music':
                console.log('准备更新背景音乐...');
                const music = document.querySelector('#background-music');
                if (music) {
                    music.src = fullPath;
                    music.load();
                    console.log('背景音乐已更新:', fullPath);
                }
                break;
        }
    }

    updateSkyTexture(fullPath) {
        const sky = document.querySelector('#sky');
        if (!sky) return;

        // 立即隐藏当前sky，避免闪烁
        sky.setAttribute('visible', 'false');

        // 创建新的图片元素来预加载
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            // 图片加载完成后，直接设置天空盒的src为完整URL
            sky.setAttribute('src', fullPath);
            // 短暂延迟后显示，确保A-Frame处理完成
            setTimeout(() => {
                sky.setAttribute('visible', 'true');
                console.log('天空贴图已更新');
            }, 100);
        };
        img.onerror = (e) => {
            console.error('天空贴图加载失败:', e);
            // 加载失败时恢复显示
            sky.setAttribute('visible', 'true');
        };
        img.src = fullPath;
    }

    updateFairyModel(fullPath) {
        const fairy = document.querySelector('#fairy');
        if (!fairy) return;

        console.log('开始更新身外化身模型:', fullPath);

        // 立即隐藏当前模型，避免闪烁
        fairy.setAttribute('visible', 'false');

        // 先移除旧的gltf-model属性，再设置新的
        fairy.removeAttribute('gltf-model');

        // 短暂延迟后设置新模型，确保旧模型被清理
        setTimeout(() => {
            fairy.setAttribute('gltf-model', fullPath);

            // 监听模型加载完成事件
            const onLoaded = () => {
                fairy.setAttribute('visible', 'true');
                console.log('身外化身模型已更新');
                fairy.removeEventListener('model-loaded', onLoaded);
            };

            const onError = (e) => {
                console.error('身外化身模型加载失败:', e.detail);
                // 加载失败时恢复显示默认模型
                fairy.setAttribute('gltf-model', '#fairyModel');
                fairy.setAttribute('visible', 'true');
                fairy.removeEventListener('model-error', onError);
            };

            fairy.addEventListener('model-loaded', onLoaded);
            fairy.addEventListener('model-error', onError);
        }, 100);
    }

    async saveGreeting() {
        const greetingText = document.getElementById('greeting-text');
        if (!greetingText || !this.currentWorldId) return;

        try {
            const response = await fetch(
                `${this.apiBase}/api/worlds/${this.currentWorldId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ greeting_message: greetingText.value })
                }
            );

            if (response.ok) {
                alert("初次见面语已保存!");
                window.customGreeting = greetingText.value;
                // 更新对话框中的开场白
                if (window.updateOpeningDialogue) {
                    window.updateOpeningDialogue(greetingText.value);
                }
            }
        } catch (error) {
            console.error("保存失败:", error);
            alert("保存失败");
        }
    }

    async savePromptText() {
        const promptText = document.getElementById('prompt-text');
        if (!promptText || !this.currentWorldId) return;

        try {
            const response = await fetch(
                `${this.apiBase}/api/worlds/${this.currentWorldId}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ system_prompt: promptText.value })
                }
            );

            if (response.ok) {
                alert("系统提示词已保存! WebSocket将重新连接以应用更改。");
                // 重新连接WebSocket以应用新的系统提示词
                if (window.reconnectWebSocket) {
                    window.reconnectWebSocket();
                }
            }
        } catch (error) {
            console.error("保存失败:", error);
            alert("保存失败");
        }
    }

    openConfigPanel() {
        const panel = document.getElementById('config-panel');
        if (panel) {
            this.populateConfigPanel();
            panel.style.display = 'flex';
        }
    }

    // 用当前场景数据填充设置面板的名称/简介/可见性/性格/见面语
    populateConfigPanel() {
        const w = this.currentWorld || {};
        const setVal = (id, val) => { const el = document.getElementById(id); if (el != null && el) el.value = val != null ? val : ''; };
        setVal('scene-name', w.name);
        setVal('scene-description', w.description);
        if (w.system_prompt) setVal('prompt-text', w.system_prompt);
        if (w.greeting_message) setVal('greeting-text', w.greeting_message);
        const vis = document.getElementById('scene-visibility');
        if (vis) vis.value = w.is_public ? 'public' : 'private';
    }

    // 保存场景名称 / 简介 / 可见性
    async saveSceneMeta() {
        if (!this.currentWorldId) { alert('请先登录'); return; }
        const name = (document.getElementById('scene-name') || {}).value || '我的世界';
        const description = (document.getElementById('scene-description') || {}).value || '';
        const isPublic = ((document.getElementById('scene-visibility') || {}).value) === 'public';
        const statusEl = document.getElementById('scene-meta-status');
        if (statusEl) { statusEl.textContent = '保存中...'; statusEl.style.color = '#7ec8e3'; }
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/${this.currentWorldId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, is_public: isPublic })
            });
            if (resp.ok) {
                if (this.currentWorld) {
                    this.currentWorld.name = name;
                    this.currentWorld.description = description;
                    this.currentWorld.is_public = isPublic;
                }
                // 自动用当前画面生成封面（仅公开时尝试）
                if (isPublic) this.captureCover();
                if (statusEl) { statusEl.textContent = isPublic ? '已保存，场景已公开到场景库 🌍' : '已保存（仅自己可见）🔒'; statusEl.style.color = '#4ade80'; }
            } else {
                if (statusEl) { statusEl.textContent = '保存失败'; statusEl.style.color = '#f87171'; }
            }
        } catch (e) {
            if (statusEl) { statusEl.textContent = '网络错误'; statusEl.style.color = '#f87171'; }
        }
    }

    // 抓取当前场景画面作为封面（静默失败）
    captureCover() {
        try {
            const scene = document.querySelector('a-scene');
            if (!scene || !scene.renderer) return;
            scene.renderer.render(scene.object3D, scene.camera);
            const dataUrl = scene.renderer.domElement.toDataURL('image/jpeg', 0.7);
            if (!dataUrl || dataUrl.length < 1000) return;
            fetch(`${this.apiBase}/api/upload/cover/${this.currentWorldId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: dataUrl })
            }).catch(() => {});
        } catch (e) { /* 忽略封面生成错误 */ }
    }

    // ==================== 个人中心 ====================

    async openProfile() {
        if (!this.currentUserId) { alert('请先登录后使用个人中心'); return; }
        const modal = document.getElementById('profile-modal');
        if (modal) modal.style.display = 'flex';
        await this.refreshMyWorlds();
    }

    async refreshMyWorlds() {
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/${this.currentUserId}`);
            if (!resp.ok) return;
            const worlds = await resp.json();
            this.worlds = worlds;
            this.renderMyWorlds(worlds);
        } catch (e) {
            console.error('加载我的场景失败:', e);
        }
    }

    renderMyWorlds(worlds) {
        const username = localStorage.getItem('username') || '访客';
        const nameEl = document.getElementById('profile-username');
        const avatarEl = document.getElementById('profile-avatar');
        const statsEl = document.getElementById('profile-stats');
        if (nameEl) nameEl.textContent = username;
        if (avatarEl) avatarEl.textContent = username.charAt(0).toUpperCase();
        const totalViews = worlds.reduce((s, w) => s + (w.view_count || 0), 0);
        if (statsEl) statsEl.textContent = `${worlds.length} 个场景 · 累计被体验 ${totalViews} 次`;

        const list = document.getElementById('my-worlds-list');
        const emptyHint = document.getElementById('profile-empty-hint');
        if (!list) return;
        list.innerHTML = '';
        if (worlds.length === 0) {
            if (emptyHint) emptyHint.style.display = 'block';
            return;
        }
        if (emptyHint) emptyHint.style.display = 'none';

        worlds.forEach(w => {
            const isActive = w.id === this.currentWorldId;
            const cover = w.cover_image
                ? `${this.apiBase}/uploads/${w.cover_image}`
                : (w.sky_texture ? `${this.apiBase}/uploads/${w.sky_texture}` : '');
            const coverStyle = cover
                ? `background-image:url('${cover}');background-size:cover;background-position:center;`
                : 'background:linear-gradient(135deg,#3a3a6a,#5a5a8a);';
            const badge = w.is_public
                ? '<span style="background:#2e7d32;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">🌍 公开</span>'
                : '<span style="background:#555;color:#ddd;padding:2px 8px;border-radius:10px;font-size:11px;">🔒 私密</span>';

            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;border:' + (isActive ? '2px solid #d4af37' : '2px solid transparent') + ';';
            card.innerHTML = `
                <div style="height:100px;${coverStyle}"></div>
                <div style="padding:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                        <strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(w.name || '未命名')}</strong>
                        ${badge}
                    </div>
                    <div style="font-size:12px;color:#999;margin:6px 0;height:32px;overflow:hidden;">${this.escapeHtml(w.description || '暂无简介')}</div>
                    <div style="font-size:11px;color:#777;margin-bottom:8px;">被体验 ${w.view_count || 0} 次 ${isActive ? '· 当前场景' : ''}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button data-act="enter" data-id="${w.id}" style="flex:1;padding:6px;background:#4a6a4a;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;">进入</button>
                        <button data-act="toggle" data-id="${w.id}" style="flex:1;padding:6px;background:#4a4a6a;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;">${w.is_public ? '转私密' : '公开'}</button>
                        <button data-act="delete" data-id="${w.id}" style="padding:6px 10px;background:#7a3a3a;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;">删除</button>
                    </div>
                </div>`;
            list.appendChild(card);
        });

        list.querySelectorAll('button[data-act]').forEach(btn => {
            const id = parseInt(btn.getAttribute('data-id'), 10);
            const act = btn.getAttribute('data-act');
            btn.addEventListener('click', () => {
                if (act === 'enter') this.enterScene(id);
                else if (act === 'toggle') this.toggleVisibility(id);
                else if (act === 'delete') this.deleteScene(id);
            });
        });
    }

    escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // 切换到某个场景作为当前可编辑场景
    async enterScene(worldId) {
        const world = (this.worlds || []).find(w => w.id === worldId);
        if (!world) return;
        this.currentWorldId = worldId;
        this.currentWorld = world;
        window.currentWorldId = worldId;
        this.applyWorldConfig(world);
        if (world.greeting_message && window.updateOpeningDialogue) {
            window.updateOpeningDialogue(world.greeting_message);
        }
        if (window.reconnectWebSocket) window.reconnectWebSocket();
        this.closeModal('profile-modal');
    }

    async toggleVisibility(worldId) {
        const world = (this.worlds || []).find(w => w.id === worldId);
        if (!world) return;
        const newPublic = !world.is_public;
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/${worldId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_public: newPublic })
            });
            if (resp.ok) {
                world.is_public = newPublic;
                if (newPublic && worldId === this.currentWorldId) this.captureCover();
                this.renderMyWorlds(this.worlds);
            }
        } catch (e) { console.error('切换可见性失败:', e); }
    }

    async deleteScene(worldId) {
        if (!confirm('确定删除这个场景吗？此操作不可恢复。')) return;
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/${worldId}`, { method: 'DELETE' });
            if (resp.ok) {
                await this.refreshMyWorlds();
                // 若删除的是当前场景，切回第一个
                if (worldId === this.currentWorldId && this.worlds.length > 0) {
                    this.enterScene(this.worlds[0].id);
                }
            }
        } catch (e) { console.error('删除场景失败:', e); }
    }

    async createScene() {
        if (!this.currentUserId) { alert('请先登录'); return; }
        const name = prompt('给新场景起个名字：', '我的新世界');
        if (name === null) return;
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/${this.currentUserId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || '我的新世界' })
            });
            if (resp.ok) {
                const data = await resp.json();
                await this.refreshMyWorlds();
                if (data.world_id) this.enterScene(data.world_id);
                // 进入后打开设置面板继续创作
                this.openConfigPanel();
            }
        } catch (e) { console.error('创建场景失败:', e); }
    }

    // ==================== 心声世界场景库 ====================

    async openLibrary() {
        const modal = document.getElementById('library-modal');
        if (modal) modal.style.display = 'flex';
        const list = document.getElementById('library-list');
        if (list) list.innerHTML = '<p style="color:#888;">加载中...</p>';
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/public/list`);
            const worlds = resp.ok ? await resp.json() : [];
            this.renderLibrary(worlds);
        } catch (e) {
            if (list) list.innerHTML = '<p style="color:#f87171;">加载失败，请重试</p>';
        }
    }

    renderLibrary(worlds) {
        const list = document.getElementById('library-list');
        const emptyHint = document.getElementById('library-empty-hint');
        if (!list) return;
        list.innerHTML = '';
        if (!worlds || worlds.length === 0) {
            if (emptyHint) emptyHint.style.display = 'block';
            return;
        }
        if (emptyHint) emptyHint.style.display = 'none';

        worlds.forEach(w => {
            const cover = w.cover_image
                ? `${this.apiBase}/uploads/${w.cover_image}`
                : (w.sky_texture ? `${this.apiBase}/uploads/${w.sky_texture}` : '');
            const coverStyle = cover
                ? `background-image:url('${cover}');background-size:cover;background-position:center;`
                : 'background:linear-gradient(135deg,#2a4d3a,#3a6a5a);';
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;';
            card.innerHTML = `
                <div style="height:120px;${coverStyle}"></div>
                <div style="padding:12px;">
                    <strong style="font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(w.name || '未命名')}</strong>
                    <div style="font-size:12px;color:#999;margin:6px 0;height:34px;overflow:hidden;">${this.escapeHtml(w.description || '一个等待探索的心声世界')}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:12px;color:#7ec8e3;">by ${this.escapeHtml(w.author || '匿名')} · ${w.view_count || 0} 次体验</span>
                        <button data-id="${w.id}" style="padding:6px 16px;background:linear-gradient(135deg,#d4af37,#f0c14b);border:none;border-radius:6px;color:#1a1a2e;cursor:pointer;font-weight:bold;font-size:13px;">体验</button>
                    </div>
                </div>`;
            list.appendChild(card);
        });

        list.querySelectorAll('button[data-id]').forEach(btn => {
            btn.addEventListener('click', () => this.visitScene(parseInt(btn.getAttribute('data-id'), 10)));
        });
    }

    async visitScene(worldId) {
        try {
            const resp = await fetch(`${this.apiBase}/api/worlds/visit/${worldId}`);
            if (!resp.ok) { alert('该场景暂时无法体验'); return; }
            const world = await resp.json();
            this.closeModal('library-modal');
            this.applyVisitorWorld(world);
        } catch (e) {
            console.error('进入场景失败:', e);
        }
    }

    closeConfigPanel() {
        const panel = document.getElementById('config-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    // ==================== 拍照功能 ====================

    setupCameraListeners() {
        const cameraBtn = document.getElementById('camera-button');
        const closePhotoBtn = document.getElementById('close-photo');
        const downloadBtn = document.getElementById('download-photo');

        if (cameraBtn) {
            cameraBtn.addEventListener('click', () => this.takePhoto());
        }
        if (closePhotoBtn) {
            closePhotoBtn.addEventListener('click', () => this.closePhotoModal());
        }
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadPhoto());
        }
    }

    takePhoto() {
        const scene = document.querySelector('a-scene');
        if (!scene) return;

        // 获取canvas并转换为图片
        const canvas = scene.components.screenshot.getCanvas('perspective');
        if (canvas) {
            this.currentPhoto = canvas.toDataURL('image/png');
            this.showPhotoPreview(this.currentPhoto);
        } else {
            // 备用方案：直接从renderer获取
            const renderer = scene.renderer;
            renderer.render(scene.object3D, scene.camera);
            this.currentPhoto = renderer.domElement.toDataURL('image/png');
            this.showPhotoPreview(this.currentPhoto);
        }
    }

    showPhotoPreview(dataUrl) {
        const modal = document.getElementById('photo-modal');
        const preview = document.getElementById('photo-preview');

        if (modal && preview) {
            preview.src = dataUrl;
            modal.style.display = 'flex';
        }
    }

    closePhotoModal() {
        const modal = document.getElementById('photo-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    downloadPhoto() {
        if (!this.currentPhoto) return;

        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `心灵世界_${timestamp}.png`;
        link.href = this.currentPhoto;
        link.click();
    }

    // ==================== 分享功能 ====================

    setupShareListeners() {
        const shareBtn = document.getElementById('share-button');
        const closeShareBtn = document.getElementById('close-share');
        const generateBtn = document.getElementById('generate-share');
        const copyLinkBtn = document.getElementById('copy-link');
        const copyAllBtn = document.getElementById('copy-all');

        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.openShareModal());
        }
        if (closeShareBtn) {
            closeShareBtn.addEventListener('click', () => this.closeShareModal());
        }
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateShareLink());
        }
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => this.copyShareLink());
        }
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => this.copyAll());
        }
    }

    async openShareModal() {
        const modal = document.getElementById('share-modal');
        if (!modal) return;

        modal.style.display = 'flex';

        // 检查是否已有分享链接
        if (this.currentWorldId) {
            await this.checkExistingShare();
        }
    }

    closeShareModal() {
        const modal = document.getElementById('share-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async checkExistingShare() {
        try {
            const response = await fetch(`${this.apiBase}/api/share/world/${this.currentWorldId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.share_code) {
                    this.showShareInfo(data.share_code, data.view_count || 0);
                }
            }
        } catch (error) {
            console.log("未找到现有分享");
        }
    }

    async generateShareLink() {
        if (!this.currentWorldId) {
            this.showShareStatus('请先登录', 'error');
            return;
        }

        const generateBtn = document.getElementById('generate-share');
        if (generateBtn) generateBtn.disabled = true;
        this.showShareStatus('正在生成...', 'info');

        try {
            const response = await fetch(`${this.apiBase}/api/share/${this.currentWorldId}`, {
                method: 'POST'
            });

            if (response.ok) {
                const data = await response.json();
                this.showShareInfo(data.share_code, 0);
                this.showShareStatus('分享链接已生成!', 'success');
            } else {
                this.showShareStatus('生成失败，请重试', 'error');
            }
        } catch (error) {
            this.showShareStatus('网络错误，请重试', 'error');
        } finally {
            if (generateBtn) generateBtn.disabled = false;
        }
    }

    showShareInfo(shareCode, viewCount) {
        const linkContainer = document.getElementById('share-link-container');
        const generateContainer = document.getElementById('share-generate');
        const linkInput = document.getElementById('share-link');
        const textArea = document.getElementById('share-text');
        const viewCountEl = document.getElementById('view-count');

        if (linkContainer) linkContainer.style.display = 'block';
        if (generateContainer) generateContainer.style.display = 'none';

        // 构建分享链接
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}?share=${shareCode}`;

        if (linkInput) {
            linkInput.value = shareUrl;
            this.currentShareUrl = shareUrl;
        }

        // 生成分享文案
        const username = localStorage.getItem('username') || '我';
        const shareText = `${username}邀请你来探索TA的心灵世界！\n\n这是一个充满魔法的森林，有可爱的精灵等你来聊天~\n\n点击链接进入：${shareUrl}`;

        if (textArea) {
            textArea.value = shareText;
            this.currentShareText = shareText;
        }

        if (viewCountEl) {
            viewCountEl.textContent = viewCount;
        }
    }

    showShareStatus(message, type) {
        const statusEl = document.getElementById('share-status');
        if (!statusEl) return;

        statusEl.textContent = message;
        statusEl.style.color = type === 'error' ? '#f87171' :
                               type === 'success' ? '#4ade80' : '#7ec8e3';
    }

    async copyShareLink() {
        if (!this.currentShareUrl) return;

        try {
            await navigator.clipboard.writeText(this.currentShareUrl);
            this.showShareStatus('链接已复制!', 'success');
        } catch (error) {
            // 备用复制方法
            this.fallbackCopy(this.currentShareUrl);
            this.showShareStatus('链接已复制!', 'success');
        }
    }

    async copyAll() {
        if (!this.currentShareText) return;

        try {
            await navigator.clipboard.writeText(this.currentShareText);
            this.showShareStatus('链接和文案已复制!', 'success');
        } catch (error) {
            this.fallbackCopy(this.currentShareText);
            this.showShareStatus('链接和文案已复制!', 'success');
        }
    }

    fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    // ==================== 访客模式 ====================

    checkVisitorMode() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareCode = urlParams.get('share');

        if (shareCode) {
            this.isVisitorMode = true;
            this.loadSharedWorld(shareCode);
            return true;
        }
        return false;
    }

    async loadSharedWorld(shareCode) {
        try {
            const response = await fetch(`${this.apiBase}/api/share/${shareCode}`);
            if (response.ok) {
                const world = await response.json();
                this.applyVisitorWorld(world);
            } else {
                alert('分享链接无效或已过期');
                this.showDefaultScene();
                window.location.href = window.location.pathname;
            }
        } catch (error) {
            console.error('加载分享世界失败:', error);
            this.showDefaultScene();
        }
    }

    applyVisitorWorld(world) {
        // 设置当前世界ID以便WebSocket使用正确的system_prompt
        if (world.id) {
            this.currentWorldId = world.id;
            window.currentWorldId = world.id;
        }

        // 显示访客提示条
        const banner = document.getElementById('visitor-banner');
        const worldName = document.getElementById('visitor-world-name');

        if (banner) banner.style.display = 'block';
        if (worldName) worldName.textContent = `正在浏览: ${world.name || '分享的世界'}`;

        // 隐藏菜单中不允许的按钮（设置和分享）
        const configBtn = document.getElementById('config-button');
        const shareBtn = document.getElementById('share-button');
        if (configBtn) configBtn.remove();
        if (shareBtn) shareBtn.remove();

        // 隐藏登录弹窗
        const usernameModal = document.getElementById('username-modal');
        if (usernameModal) usernameModal.style.display = 'none';

        // 应用世界配置
        const scene = document.querySelector('a-scene');
        const applyConfig = () => {
            // 天空贴图
            if (world.sky_texture) {
                this.updateSkyTexture(`${this.apiBase}/uploads/${world.sky_texture}`);
            } else {
                const sky = document.querySelector('#sky');
                if (sky) sky.setAttribute('visible', 'true');
            }

            // 身外化身模型
            if (world.fairy_model) {
                this.updateFairyModel(`${this.apiBase}/uploads/${world.fairy_model}`);
            } else {
                // 没有自定义，加载默认模型
                const fairy = document.querySelector('#fairy');
                if (fairy) {
                    fairy.setAttribute('gltf-model', '#fairyModel');
                    fairy.addEventListener('model-loaded', () => {
                        fairy.setAttribute('visible', 'true');
                    }, { once: true });
                }
            }

            // 背景音乐
            if (world.background_music) {
                const music = document.querySelector('#background-music');
                if (music) music.src = `${this.apiBase}/uploads/${world.background_music}`;
            }

            // 开场白
            if (world.greeting_message) {
                window.customGreeting = world.greeting_message;
            }
        };

        if (scene && scene.hasLoaded) {
            applyConfig();
        } else if (scene) {
            scene.addEventListener('loaded', applyConfig, { once: true });
        }

        // 绑定创建自己世界按钮
        const createBtn = document.getElementById('create-own-world');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                window.location.href = window.location.pathname;
            });
        }
    }
}

// 创建全局实例
const worldConfig = new WorldConfig();

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 先检查访客模式
    const isVisitorMode = worldConfig.checkVisitorMode();

    // 如果不是访客模式，初始化配置
    if (!isVisitorMode) {
        worldConfig.init();
    }

    // 设置拍照和分享监听器
    worldConfig.setupCameraListeners();
    worldConfig.setupShareListeners();
    // 个人中心 / 场景库监听器（访客模式也可浏览场景库）
    worldConfig.setupCenterListeners();
});
