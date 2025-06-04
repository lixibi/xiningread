#  希宁阅读 · 一页知星海

希宁阅读 (XiningRead) is a web application designed for a pleasant reading experience, especially on e-ink devices. It allows you to browse and read books stored on your server and also supports reading books uploaded directly from your local device.

墨水屏优化的个人读书应用，专为10寸电子墨水屏设计，提供优雅的文件浏览和阅读体验。

## ✨ 特性

### 🖥️ 墨水屏专项优化
- **高对比度设计**：纯黑白配色，清晰易读
- **大字体友好**：默认18px，支持12-32px调节
- **简洁界面**：最小化UI，专注内容
- **减少刷新**：优化交互，降低屏幕刷新频率
- **透明按钮**：60%透明度翻页按钮，不干扰阅读

### 📁 智能文件管理
- **目录浏览**：支持多级目录导航
- **类型标签**：PDF、EPUB、MD、TXT等文件类型标签
- **安全访问**：防止目录遍历攻击，文件名安全验证
- **编码支持**：自动检测UTF-8/GBK编码

### 📖 多格式阅读支持
- **PDF文件**：浏览器内嵌预览，支持缩放和导航
- **EPUB电子书**：解析并渲染为HTML，保留格式
- **HTML文件**：直接在浏览器中渲染显示
- **Markdown文档**：实时渲染，支持代码高亮和表格
- **代码文件**：语法高亮，支持20+编程语言
- **文本文件**：中文段落自动缩进，编码自动检测

### 🎯 阅读体验优化
- **字体调节**：实时调整字体大小（12-32px）
- **行距控制**：支持1.4-2.2倍行距调节
- **宽度切换**：800px固定宽度 ↔ 100%全宽
- **阅读进度**：实时显示阅读百分比
- **快捷键支持**：键盘快捷操作
- **浮动按钮**：透明翻页按钮，不干扰阅读

## 🚀 Docker快速部署

### 一键启动
```bash
./start.sh
```

### 手动部署
```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 一键运行推荐命令
```bash
docker run -d -p 9588:9588 -v "$(pwd)/book:/app/filesystem" ghcr.io/lixibi/xiningread:latest
```
**注意：** 请将命令中的 `$(pwd)/book` 替换为您宿主机上实际存放书籍的目录路径。例如，如果您的书籍存放在主机的 `/my/books` 目录下，那么对应的部分应修改为 `-v "/my/books:/app/filesystem"`。这个设置会将您宿主机的书籍目录挂载到 Docker 容器内的 `/app/filesystem` 路径，从而让应用能够读取到您的书籍。

### 访问地址
- **本地访问**：http://localhost:9588
- **局域网访问**：http://[IP地址]:9588

## 🔄 GitHub Actions 自动构建

本项目已配置 GitHub Actions 工作流，可自动构建并发布 Docker 镜像：

- **触发条件**：推送到主分支或创建版本标签（v*.*.*)
- **镜像仓库**：GitHub Container Registry (GHCR)
- **多平台支持**：同时支持 x86_64 (AMD64) 和 ARM64 架构
- **使用方法**：`docker pull ghcr.io/用户名/xiningread:标签`

详细说明请查看 [GitHub Actions 指南](docs/github-actions-guide.md)

## 📦 技术栈

- **后端**：Flask 2.3.3 + Python 3.11
- **前端**：HTML5 + CSS3 + Vanilla JavaScript
- **容器化**：Docker + docker-compose
- **文件解析**：Markdown + Pygments + EbookLib
- **字体**：Times New Roman + SimSun
- **端口**：9588

## 使用说明

### 文件浏览
1. 首页显示当前目录的文件和文件夹
2. 点击📁文件夹图标进入子目录
3. 点击".. (返回上级)"返回父目录
4. 文本文件显示📖阅读按钮
5. 所有文件都提供⬇️下载功能

### 阅读功能
- **🔤- / 🔤+**：调整字体大小
- **📏**：切换行距（1.4/1.6/1.8/2.0/2.2倍）
- **📐**：切换阅读宽度（800px ↔ 100%）
- **进度条**：显示阅读进度百分比

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl + ↑/↓` | 调整字体大小 |
| `Ctrl + Space` | 调整行距 |
| `Ctrl + W` | 切换宽度模式 |
| `Home/End` | 跳转文档首尾 |
| `F1` 或 `Shift + ?` | 显示帮助 |

## 支持的文件类型

### 📚 电子书格式
- `.pdf` - PDF文档（浏览器内嵌预览）
- `.epub` - EPUB电子书（解析为HTML显示）

### 📄 文档格式
- `.html/.htm` - HTML网页（直接渲染）
- `.md` - Markdown文档（实时渲染）
- `.txt` - 纯文本文件（中文段落缩进）

### 💻 代码文件（语法高亮）
- `.py` - Python源代码
- `.js` - JavaScript文件
- `.css` - CSS样式表
- `.java` - Java源代码
- `.cpp/.c/.h` - C/C++源代码
- `.php` - PHP脚本
- `.rb` - Ruby脚本
- `.go` - Go语言
- `.rs` - Rust语言
- `.swift` - Swift语言
- `.kt` - Kotlin语言
- `.scala` - Scala语言
- `.sh/.bat/.ps1` - 脚本文件
- `.sql` - SQL脚本

### 📊 数据文件
- `.json` - JSON数据文件
- `.xml` - XML文档
- `.csv` - CSV表格文件
- `.yaml/.yml` - YAML配置文件
- `.ini/.cfg/.conf/.toml` - 配置文件
- `.log` - 日志文件

### 🔧 其他功能
- **自动编码检测**：UTF-8/GBK自动识别
- **安全文件访问**：防止目录遍历攻击
- **文件大小显示**：B/KB/MB自动格式化
- **下载功能**：所有文件都支持下载
- **预览功能**：支持浏览器内预览

## 墨水屏优化细节

### 颜色方案
```css
文字颜色：#000000 (纯黑)
背景颜色：#ffffff (纯白)  
辅助背景：#f8f8f8 (浅灰)
边框颜色：#000000 (纯黑)
```

### 字体设置
```css
主字体：Times New Roman, SimSun, serif
字体大小：18px (默认)
行高：1.8 (默认)
字重：normal/bold
```

### 布局特点
- **大按钮**：最小44px点击区域
- **清晰边框**：2-3px实线边框
- **充足间距**：15-30px内外边距
- **简化动效**：减少transition和animation

## 项目结构

```
mcptest/
├── app.py                 # Flask主应用
├── requirements.txt       # Python依赖
├── templates/            # HTML模板
│   ├── base.html        # 基础模板
│   ├── index.html       # 文件列表页
│   └── reader.html      # 文件阅读页
├── static/              # 静态资源
│   ├── css/
│   │   └── style.css    # 墨水屏优化样式
│   └── js/
│       └── reader.js    # 阅读器交互逻辑
└── 示例文档.txt          # 示例文档
```

## 开发说明

### 安全特性
- 路径安全检查，防止目录遍历
- 文件类型验证
- XSS防护（模板自动转义）

### 性能优化
- 静态文件缓存
- 滚动事件节流
- 本地存储用户设置

### 扩展性
- 模块化设计
- 易于添加新文件类型支持
- 可配置的根目录

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

---

**希宁阅读 · 一页知星海** ✨
*墨水屏优化的个人读书应用*
