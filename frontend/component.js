
// 菜单展开/收起控制
const menuToggle = document.getElementById('menu-toggle');
const menuItems = document.getElementById('menu-items');

if (menuToggle && menuItems) {
    menuToggle.addEventListener('click', function() {
        menuToggle.classList.toggle('active');
        menuItems.classList.toggle('show');
    });

    // 点击菜单项后自动收起菜单（除了需要保持开启的按钮）
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            // 音乐和自动播放按钮点击后不收起菜单
            if (this.id !== 'music-button' && this.id !== 'autoplay-button') {
                menuToggle.classList.remove('active');
                menuItems.classList.remove('show');
            }
        });
    });

    // 点击其他区域收起菜单
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#menu-container')) {
            menuToggle.classList.remove('active');
            menuItems.classList.remove('show');
        }
    });
}

// 更新的全屏控制代码
const fullscreenButton = document.getElementById('fullscreen-button');
fullscreenButton.addEventListener('click', function () {
    if (!document.fullscreenElement && !document.mozFullScreenElement &&
        !document.webkitFullscreenElement && !document.msFullscreenElement) {
        // 进入全屏
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    } else {
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
});

// F11 键控制全屏
document.addEventListener('keydown', function (event) {
    if (event.key === 'F11') {
        event.preventDefault();
        fullscreenButton.click();
    }
});

// 渲染对话条目
let currentDialogueIndex = 0;
const dialogueContent = document.getElementById('dialogue-content');
const expandButton = document.getElementById('expand-button');
let isExpanded = false;
function renderDialogue(entry) {
    const dialogueEntry = document.createElement('div');
    dialogueEntry.classList.add('dialogue-entry');
    if (entry.speaker === "User") {
        dialogueEntry.classList.add('user-dialogue');
        dialogueEntry.innerHTML = `<span>${entry.text}</span>`;
    } else {
        dialogueEntry.classList.add('companion-dialogue');
        dialogueEntry.innerHTML = `<span>${entry.text}</span>`;
    }
    dialogueContent.appendChild(dialogueEntry);
}

// 添加音乐按钮点击事件
const musicButton = document.getElementById('music-button');
const backgroundMusic = document.getElementById('background-music');
let isPlaying = false;

// 确保音频元素正确加载
backgroundMusic.load();

musicButton.addEventListener('click', function () {
    if (!isPlaying) {
        // 尝试播放音乐
        const playPromise = backgroundMusic.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                isPlaying = true;
                musicButton.style.background = 'rgba(0, 0, 0, 0.5)';
                musicButton.querySelector('svg path').style.fill = 'white';
            }).catch((error) => {
                console.error('音乐播放失败:', error);
                // 如果是自动播放策略阻止，提示用户
                if (error.name === 'NotAllowedError') {
                    alert('请点击页面任意位置后再试');
                }
            });
        }
    } else {
        backgroundMusic.pause();
        isPlaying = false;
        musicButton.style.background = 'rgba(0, 0, 0, 0.3)';
        musicButton.querySelector('svg path').style.fill = 'rgba(255, 255, 255, 0.3)';
    }
});

// 注册 tour 组件，用于自动播放 sky
AFRAME.registerComponent('tour', {
    schema: {
        speed: { type: 'number', default: 5 } // 默认旋转速度
    },
    init: function () {
        this.yaw = this.el.getAttribute('rotation').y || 0; // 初始化旋转角度
    },
    tick: function (time, timeDelta) {
        // 每一帧中更新旋转角度，使得 sky 进行旋转
        this.yaw += this.data.speed * timeDelta / 1000;
        this.el.setAttribute('rotation', { x: 0, y: this.yaw, z: 0 });
    }
});

// 获取 autoplay 按钮和 <a-sky> 元素
const autoplayButton = document.getElementById('autoplay-button');
const sky = document.querySelector('#sky'); // 获取 a-sky 元素

let isAutoplayEnabled = false;
// 点击按钮切换自动播放状态
autoplayButton.addEventListener('click', function () {
    isAutoplayEnabled = !isAutoplayEnabled;

    if (isAutoplayEnabled) {
        // 添加自动播放组件到 a-sky 元素
        sky.setAttribute('tour', 'speed: 5');
        // 更新按钮图标，变为暂停
        autoplayButton.querySelector('svg path').setAttribute('d', 'M384 192h256v640H384z'); // 改为暂停图标
    } else {
        // 移除自动播放组件
        sky.removeAttribute('tour');
        // 更新按钮图标，变为播放
        autoplayButton.querySelector('svg path').setAttribute('d', 'M896 512L384 832V192z'); // 改为播放图标
    }
});

// 展开按钮功能
expandButton.addEventListener('click', () => {
    if (isExpanded) {
        dialogueContent.style.height = '15vh';
        expandButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24"> <path fill="rgba(255, 255, 255, 0.5)" d="m12 11.325l2.375 2.375q.275.275.688.275t.712-.275q.3-.3.3-.712t-.3-.713L12.7 9.2q-.3-.3-.7-.3t-.7.3l-3.1 3.1q-.3.3-.287.7t.312.7q.3.275.7.288t.7-.288zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/></svg>`;
    } else {
        dialogueContent.style.height = '80vh';
        expandButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="2em" height="2em" viewBox="0 0 24 24"> <path fill="rgba(255, 255, 255, 0.5)" d="M12 12.675L9.625 10.3q-.275-.275-.687-.275t-.713.275q-.3.3-.3.713t.3.712L11.3 14.8q.3.3.7.3t.7-.3l3.1-3.1q.3-.3.287-.7t-.312-.7q-.3-.275-.7-.288t-.7.288zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/></svg>`;
    }
    isExpanded = !isExpanded;
});

// 鼠标滚轮控制前后移动
document.querySelector('a-scene').addEventListener('wheel', function (event) {
    const rig = document.querySelector('#rig'); // 获取摄像机容器元素（rig）
    const moveStep = 1; // 每次滚动移动的距离
    if (event.deltaY < 0) {
        // 向上滚动鼠标滚轮，向前移动视角
        rig.object3D.position.z -= moveStep;
    } else {
        // 向下滚动鼠标滚轮，向后移动视角
        rig.object3D.position.z += moveStep;
    }
});
