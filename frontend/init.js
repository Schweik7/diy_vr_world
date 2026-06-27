
// 打印天空盒的大小
const skyScale = document.querySelector('#sky').getAttribute('scale');
console.log('Skybox Scale:', skyScale); // 例如：{ x: 100, y: 100, z: 100 }

// 获取模型并计算边界盒的大小
function getModelSize(modelId) {
    const modelEl = document.querySelector(`#${modelId}`);
    
    // 等待模型加载完成
    modelEl.addEventListener('loaded', () => {
        const object3D = modelEl.object3D;
        const boundingBox = new THREE.Box3().setFromObject(object3D); // 获取模型的边界盒
        const size = new THREE.Vector3();
        boundingBox.getSize(size); // 获取尺寸（宽度、深度、高度）
        
        console.log(`${modelId} Size:`);
        console.log(`Width: ${size.x}, Height: ${size.y}, Depth: ${size.z}`);
    });
}

// 打印所有模型的大小
getModelSize('fairyModel');
getModelSize('dropletModel');
getModelSize('flowerModel');
getModelSize('stoneModel');
getModelSize('petalModel');
getModelSize('butterflyModel');
