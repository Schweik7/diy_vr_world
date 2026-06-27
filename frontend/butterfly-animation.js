// once: THREE.LoopOnce,  // 只播放一次
// repeat: THREE.LoopRepeat,  // 循环播放
// pingpong: THREE.LoopPingPong  // 往返播放
AFRAME.registerComponent("butterfly-animation", {
    schema: {
        idle: { default: "metarig|3" },
        takeoff: { default: "metarig|!" },
        flying: { default: "metarig|2" },
    },
    init: function () {
        this.state = "idle"; // 初始状态
        this.playAnimation(this.data.idle);
    },
    playAnimation: function (clip, mode="repeat", timeScale=1) {
        this.el.setAttribute("animation-mixer", { clip, loop: mode, timeScale });
    },
    transitionToState: function (state) {
        if (this.state === state) return;
        this.state = state;

        if (state === "idle") {
            this.playAnimation(this.data.idle);
        } else if (state === "takeoff") {
            this.playAnimation(this.data.takeoff, "pingpong", 1); // 设置为 pingpong 模式
            // this.monitorTakeoffPosition(); // 不会变换位置，只播放动画
            setTimeout(() => this.transitionToState("flying"), 10500);
        } else if (state === "flying") {
            this.playAnimation(this.data.flying);
            this.startFlyingMovement();
        }
    },
    monitorTakeoffPosition: function () {
        const butterflyEl = this.el;
        const originalPosition = new THREE.Vector3();
        butterflyEl.object3D.getWorldPosition(originalPosition);

        // 打印蝴蝶初始位置
        log(`起飞前蝴蝶位置: ${originalPosition.x}, ${originalPosition.y}, ${originalPosition.z}`);

        // 每50毫秒打印蝴蝶的位置（或根据实际需要调整频率）
        this.positionInterval = setInterval(() => {
            const currentPosition = butterflyEl.object3D.position;
            log(`蝴蝶当前起飞位置: ${currentPosition.x}, ${currentPosition.y}, ${currentPosition.z}`);
        }, 50);
    },
    stopPositionMonitoring: function () {
        if (this.positionInterval) {
            clearInterval(this.positionInterval);
            this.positionInterval = null;
        }
    },
    startFlyingMovement: function () {
        const radius = 3;
        const speed = 0.03;
        let angle = 0;
        const originalPosition = new THREE.Vector3();
        this.el.object3D.getWorldPosition(originalPosition);
        this.flyingInterval = setInterval(() => {
            angle += speed;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = Math.sin(angle * 2) * 0.5; // 上下波动
            this.el.setAttribute("position", `${originalPosition.x + x} ${originalPosition.y + y} ${originalPosition.z + z}`);
        }, 50);
    },
    stopFlyingMovement: function () {
        if (this.flyingInterval) {
            clearInterval(this.flyingInterval);
            this.flyingInterval = null;
        }
    },
});


document.addEventListener("DOMContentLoaded", function () {
    const butterflyEl = document.querySelector("#butterfly");

    // 初始化蝶蚌动画
    butterflyEl.setAttribute("animation-mixer", {
        clip: "metarig|1", // 默认播放待机动画
        loop: "repeat",
    });
    butterflyEl.setAttribute("butterfly-animation","");

});