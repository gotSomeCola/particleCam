// 计算采样步长（基于像素密度）
const stepX = Math.floor(videoCanvas.width / (window.innerWidth / pixelSize));
const stepY = Math.floor(videoCanvas.height / (window.innerHeight / pixelSize));

// 获取图像数据
const imgData = videoCtx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
const data = imgData.data;

// 更新每个像素块
pixelBlocks.forEach(pixel => {
    const { gridX, gridY } = pixel.userData;
    
    // 计算采样位置
    const sampleX = Math.min(gridX * stepX, videoCanvas.width - 1);
    const sampleY = Math.min(gridY * stepY, videoCanvas.height - 1);
    
    // 获取像素颜色
    const idx = (sampleY * videoCanvas.width + sampleX) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    
    // 设置颜色
    pixel.material.color.setRGB(r/255, g/255, b/255);
    
    // 计算亮度（0-1）
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
});