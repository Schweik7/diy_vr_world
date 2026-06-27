AFRAME.registerComponent('area-debug', {
    schema: {
      // 预设草地区域的初始坐标
      presetArea: {
        type: 'array',
        default: [
          { x: -3, y: 0, z: -10 },    // 左上
          { x: 3, y: 0, z: -10 },     // 右上
          { x: 3, y: -2, z: -10 },    // 右下
          { x: -3, y: -2, z: -10 }    // 左下
        ]
      }
    },
  
    init: function() {
      // 创建调试区域
      this.debugArea = document.createElement('a-entity');
      this.debugArea.setAttribute('geometry', {
        primitive: 'plane',
        width: 2,
        height: 2
      });
      this.debugArea.setAttribute('material', {
        color: '#00ff00',
        opacity: 0.3,
        transparent: true,
        side: 'double'
      });
      
      // 添加尺寸文本显示
      this.dimensionsText = document.createElement('a-text');
      this.dimensionsText.setAttribute('value', '');
      this.dimensionsText.setAttribute('align', 'center');
      this.dimensionsText.setAttribute('color', '#ffffff');
      this.dimensionsText.setAttribute('scale', '0.5 0.5 0.5');
      this.debugArea.appendChild(this.dimensionsText);
      
      this.el.sceneEl.appendChild(this.debugArea);
      
      this.initControlPoints();
      this.addCustomKeyboardControls();
      this.updateDebugArea();
      this.logAreaInfo();
    },
    
    initControlPoints: function() {
      this.points = [];
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
      
      // 使用预设坐标创建控制点
      for(let i = 0; i < 4; i++) {
        const point = document.createElement('a-entity');
        point.setAttribute('geometry', {
          primitive: 'sphere',
          radius: 0.1
        });
        point.setAttribute('material', {
          color: colors[i],
          opacity: 0.7
        });
        
        // 设置预设位置
        const preset = this.data.presetArea[i];
        point.setAttribute('position', preset);
        
        this.el.sceneEl.appendChild(point);
        this.points.push(point);
      }
    },
    
    addCustomKeyboardControls: function() {
      let selectedPoint = 0;
      const moveSpeed = 0.1;
      
      window.addEventListener('keydown', (e) => {
        // 选择控制点 (1-4键)
        if(e.key >= '1' && e.key <= '4') {
          selectedPoint = parseInt(e.key) - 1;
          console.log(`Selected point ${selectedPoint + 1}`);
          return;
        }
        
        const point = this.points[selectedPoint];
        const pos = point.getAttribute('position');
        
        // 自定义按键映射
        switch(e.key.toLowerCase()) {
          case 'i': // 上
            point.setAttribute('position', {x: pos.x, y: pos.y + moveSpeed, z: pos.z});
            break;
          case 'k': // 下
            point.setAttribute('position', {x: pos.x, y: pos.y - moveSpeed, z: pos.z});
            break;
          case 'j': // 左
            point.setAttribute('position', {x: pos.x - moveSpeed, y: pos.y, z: pos.z});
            break;
          case 'l': // 右
            point.setAttribute('position', {x: pos.x + moveSpeed, y: pos.y, z: pos.z});
            break;
          case 'q': // 前
            point.setAttribute('position', {x: pos.x, y: pos.y, z: pos.z - moveSpeed});
            break;
          case 'e': // 后
            point.setAttribute('position', {x: pos.x, y: pos.y, z: pos.z + moveSpeed});
            break;
        }
        
        this.updateDebugArea();
        this.logAreaInfo();
      });
    },
    
    updateDebugArea: function() {
      const center = this.calculateCenter();
      this.debugArea.setAttribute('position', center);
      
      const width = this.calculateWidth();
      const height = this.calculateHeight();
      this.debugArea.setAttribute('geometry', {
        width: width,
        height: height
      });
      
      const rotation = this.calculateRotation();
      this.debugArea.setAttribute('rotation', rotation);
      
      // 更新尺寸显示
      this.dimensionsText.setAttribute('value', 
        `Width: ${width.toFixed(2)}m\nHeight: ${height.toFixed(2)}m\nArea: ${(width * height).toFixed(2)}m²`);
      this.dimensionsText.setAttribute('position', {x: 0, y: height/2 + 0.5, z: 0});
    },
    
    calculateCenter: function() {
      let x = 0, y = 0, z = 0;
      this.points.forEach(point => {
        const pos = point.getAttribute('position');
        x += pos.x;
        y += pos.y;
        z += pos.z;
      });
      return {x: x/4, y: y/4, z: z/4};
    },
    
    calculateWidth: function() {
      const p0 = this.points[0].getAttribute('position');
      const p1 = this.points[1].getAttribute('position');
      return this.distance(p0, p1);
    },
    
    calculateHeight: function() {
      const p0 = this.points[0].getAttribute('position');
      const p3 = this.points[3].getAttribute('position');
      return this.distance(p0, p3);
    },
    
    distance: function(p1, p2) {
      return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2)
      );
    },
    
    calculateRotation: function() {
      const center = this.calculateCenter();
      return {
        x: 0,
        y: Math.atan2(center.x, center.z) * 180 / Math.PI,
        z: 0
      };
    },
    
    logAreaInfo: function() {
      console.log('Area Coordinates:');
      this.points.forEach((point, i) => {
        const pos = point.getAttribute('position');
        console.log(`Point ${i + 1}: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`);
      });
      
      const center = this.calculateCenter();
      console.log('Center:', {
        x: center.x.toFixed(2),
        y: center.y.toFixed(2),
        z: center.z.toFixed(2)
      });
      
      console.log('Dimensions:', {
        width: this.calculateWidth().toFixed(2),
        height: this.calculateHeight().toFixed(2),
        area: (this.calculateWidth() * this.calculateHeight()).toFixed(2)
      });
    }
  });