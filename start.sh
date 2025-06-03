#!/bin/bash

# 电子阅读器启动脚本

echo "🚀 启动10寸墨水屏电子阅读器..."

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

# 检查docker-compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose未安装，请先安装docker-compose"
    exit 1
fi

# 创建filesystem目录
mkdir -p filesystem

# 检查是否有示例文件
if [ ! "$(ls -A filesystem)" ]; then
    echo "📁 filesystem目录为空，创建示例文件..."
    echo "欢迎使用10寸墨水屏电子阅读器！

这是一个示例文档。您可以：

1. 将您的文档放入filesystem文件夹
2. 支持的格式：PDF、EPUB、Markdown、TXT、HTML等
3. 访问 http://localhost:9588 开始阅读

功能特点：
- 专为墨水屏优化的黑白界面
- 支持书签功能
- 字体大小调节
- 浏览器全屏模式
- 翻页按钮
- 多种文件格式支持

祝您阅读愉快！" > filesystem/欢迎使用.txt
fi

# 构建并启动容器
echo "🔨 构建Docker镜像..."
docker-compose build

echo "🚀 启动服务..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
if docker-compose ps | grep -q "Up"; then
    echo "✅ 服务启动成功！"
    echo ""
    echo "📖 访问地址："
    echo "   本地访问: http://localhost:9588"
    echo "   局域网访问: http://$(hostname -I | awk '{print $1}'):9588"
    echo ""
    echo "📁 文件目录: ./filesystem"
    echo "🔧 管理命令:"
    echo "   查看日志: docker-compose logs -f"
    echo "   停止服务: docker-compose down"
    echo "   重启服务: docker-compose restart"
else
    echo "❌ 服务启动失败，请检查日志："
    docker-compose logs
fi
