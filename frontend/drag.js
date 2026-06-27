const LOG_ENABLED = true;

function log(message) {
    if (LOG_ENABLED) {
        console.info(message);
    }
}

window.progress = { droplet: 0, flower: 0, chat: 0 };

function updateProgress(task = "droplet") {
    progress[task] = 1;
    let finished = progress.droplet + progress.flower + progress.chat;

    const taskElement = document.querySelector(`#${task}-task`).parentElement;
    const taskCheckbox = document.querySelector(`#${task}-task`);
    const taskSpan = taskElement.querySelector("span");
    taskCheckbox.checked = true;
    document.querySelector(`span#progress`).textContent = `${finished} / 3`;
    taskSpan.style.textDecoration = "line-through";
    taskSpan.style.color = "#A9A9A9";

    if (finished === 3) {
        alert("恭喜你，所有任务已完成！");
    }
}

window.interactives = document.querySelectorAll(".interactive");
AFRAME.registerComponent("raycaster-interaction", {
    init: function () {
        this.sceneEl = this.el.sceneEl;
        this.sceneEl.addEventListener("loaded", () => {
            this.cameraEl = this.sceneEl.querySelector("a-camera");
            if (this.cameraEl) {
                this.camera = this.cameraEl.getObject3D("camera");
            } else {
                console.error("Camera not found in the scene!");
            }
        });
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.selectedObject = null;
        this.cloneObject = null;
        this.originalMaterial = null;

        window.addEventListener("mousedown", (event) => {
            if (event.button === 1 || event.shiftKey) {
                this.updateMouseCoordinates(event);
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.sceneEl.object3D.children, true);

                if (intersects.length > 0) {
                    const intersectedEl = intersects[0].object.el;
                    if (intersectedEl && intersectedEl.classList.contains("interactive")) {
                        this.selectedObject = intersectedEl;
                        this.isDragging = true;
                        this.createCloneObject(intersectedEl);
                        window.addEventListener("mousemove", this.onMouseMove.bind(this));
                        window.addEventListener("mouseup", this.onMouseUp.bind(this));
                    }
                }
            }
        });
    },
    createCloneObject: function (intersectedEl) {
        const sceneEl = this.el.sceneEl;
        this.cloneObject = document.createElement("a-entity");
        this.cloneObject.setAttribute("gltf-model", intersectedEl.getAttribute("gltf-model"));
        this.cloneObject.setAttribute("scale", intersectedEl.getAttribute("scale"));
        sceneEl.appendChild(this.cloneObject);

        const originalPosition = new THREE.Vector3();
        intersectedEl.object3D.getWorldPosition(originalPosition);
        this.cloneObject.object3D.position.copy(originalPosition);
    },
    onMouseMove: function (event) {
        if (this.isDragging && this.cloneObject) {
            // 获取鼠标坐标，并更新投射器
            this.updateMouseCoordinates(event);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const ray = new THREE.Ray(this.camera.position, this.mouse); // 创建射线

            // 打印射线的起点和方向
            // console.log("Ray start:", ray.origin);
            // console.log("Ray direction:", ray.direction);


            const worldPosition = new THREE.Vector3();
            this.raycaster.ray.at(2, worldPosition);
            this.cloneObject.object3D.position.lerp(worldPosition, 0.2);  // 让花平滑跟随鼠标

            // 获取蝴蝶和花的位置
            const butterflyEl = document.getElementById("butterfly");
            const butterflyPosition = butterflyEl.object3D.position;
            const flowerPosition = this.cloneObject.object3D.position;
            const cameraPosition = this.camera.position;

            // 计算从摄像机到花、蝴蝶的向量
            const cameraToFlower = flowerPosition.clone().sub(cameraPosition).normalize();
            const cameraToButterfly = butterflyPosition.clone().sub(cameraPosition).normalize();

            // 计算这两个向量之间的夹角
            const angleBetween = cameraToFlower.angleTo(cameraToButterfly);  // 得到夹角，单位是弧度

            // 设置一个角度阈值（比如30度）
            const angleThreshold = Math.PI / 6;
            const distanceThreshold = 150;
            // 如果夹角小于阈值，且花与蝴蝶的距离在可接受范围内，则触发磁吸
            const distance = flowerPosition.distanceTo(butterflyPosition);
            // console.info(`distance: ${distance}，angle: ${angleBetween}`);
            if (angleBetween < angleThreshold) {
                const attractStrength = Math.max(0, (distanceThreshold - distance) / distanceThreshold);
                const direction = butterflyPosition.clone().sub(flowerPosition).normalize();
                this.cloneObject.object3D.position.add(direction.multiplyScalar(attractStrength * 0.2));
            }
        }
    },

    onMouseUp: function () {
        if (this.isDragging && this.selectedObject) {
            if (this.selectedObject.id === "droplet") {
                const angryStoneEl = document.getElementById("angry-stone");
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObject(angryStoneEl.object3D, true);

                if (intersects.length > 0) {
                    log('droplet 移动到 angry-stone 上');
                    skipStoneAnimation();
                    updateProgress("droplet");
                }
            } else if (this.selectedObject.id === "flower") {
                const butterflyEl = document.getElementById("butterfly");
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObject(butterflyEl.object3D, true);

                if (intersects.length > 0) {
                    log('flower 移动到 butterfly 上');
                    const butterflyEl = document.getElementById("butterfly");
                    butterflyEl.components["butterfly-animation"].transitionToState("takeoff");
                    updateProgress("flower");
                }
            }
            if (this.cloneObject) {
                this.cloneObject.parentNode.removeChild(this.cloneObject);
                this.cloneObject = null;
            }
            this.isDragging = false;
            this.selectedObject = null;
            window.removeEventListener("mousemove", this.onMouseMove.bind(this));
            window.removeEventListener("mouseup", this.onMouseUp.bind(this));
        }
    },
    updateMouseCoordinates: function (event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    },
});


function getOriginalMaterials(entityId) {
    const model = document.querySelector(`#${entityId}`).object3D;
    const originalMaterials = [];
    model.traverse((node) => {
        if (node.isMesh && node.material) {
            originalMaterials.push(node.material.clone());
        }
    });
    return originalMaterials;
}

function restoreOriginalMaterials(entityId, originalMaterials) {
    if (!originalMaterials) return;
    const model = document.querySelector(`#${entityId}`).object3D;
    let index = 0;
    model.traverse((node) => {
        if (node.isMesh) {
            node.material = originalMaterials[index++];
        }
    });
}
