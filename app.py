from flask import Flask, render_template, request, send_file, abort, jsonify
import os
import mimetypes
from pathlib import Path
import urllib.parse
import markdown
import re
import logging
from werkzeug.utils import secure_filename
from functools import lru_cache
import time
import tempfile
import shutil
try:
    import ebooklib
    from ebooklib import epub
    EPUB_SUPPORT = True
except ImportError:
    EPUB_SUPPORT = False

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 配置Flask
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB最大文件大小
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000  # 静态文件缓存1年

# 配置文件根目录（filesystem文件夹）
ROOT_DIR = os.path.join(os.getcwd(), 'filesystem')

# 配置临时文件目录（用于本地文件上传）
TEMP_DIR = os.path.join(os.getcwd(), 'temp_uploads')
os.makedirs(TEMP_DIR, exist_ok=True)

def safe_path_join(base_path, *paths):
    """安全的路径拼接，防止目录遍历攻击"""
    try:
        # 清理路径组件
        clean_paths = []
        for path in paths:
            if path:
                # 移除危险字符
                clean_path = path.replace('..', '').replace('\\', '/').strip('/')
                if clean_path:
                    clean_paths.append(clean_path)

        if not clean_paths:
            return base_path

        full_path = os.path.join(base_path, *clean_paths)
        # 确保结果路径在基础路径内
        if not os.path.abspath(full_path).startswith(os.path.abspath(base_path)):
            logger.warning(f"Path traversal attempt detected: {paths}")
            return base_path

        return full_path
    except Exception as e:
        logger.error(f"Error in safe_path_join: {e}")
        return base_path

def validate_filename(filename):
    """验证文件名安全性"""
    if not filename:
        return False

    # 检查危险字符
    dangerous_chars = ['..', '\\', ':', '*', '?', '"', '<', '>', '|']
    for char in dangerous_chars:
        if char in filename:
            return False

    # 检查文件名长度
    if len(filename) > 255:
        return False

    return True

@lru_cache(maxsize=1000)
def get_file_info_cached(filepath, mtime):
    """获取文件信息（带缓存）"""
    return _get_file_info_internal(filepath)

def _get_file_info_internal(filepath):
    """内部文件信息获取函数"""
    stat = os.stat(filepath)
    size = stat.st_size
    
    # 格式化文件大小
    if size < 1024:
        size_str = f"{size} B"
    elif size < 1024 * 1024:
        size_str = f"{size / 1024:.1f} KB"
    else:
        size_str = f"{size / (1024 * 1024):.1f} MB"
    
    # 获取文件类型标签
    file_type_label = get_file_type_label(filepath)

    return {
        'name': os.path.basename(filepath),
        'size': size_str,
        'is_text': is_text_file(filepath) or is_pdf_file(filepath) or is_epub_file(filepath) or is_html_file(filepath),
        'type_label': file_type_label
    }

def get_file_info(filepath):
    """获取文件信息（使用缓存）"""
    try:
        stat = os.stat(filepath)
        mtime = stat.st_mtime
        return get_file_info_cached(filepath, mtime)
    except Exception as e:
        logger.error(f"Error getting file info for {filepath}: {e}")
        return {
            'name': os.path.basename(filepath),
            'size': 'Unknown',
            'is_text': False,
            'type_label': 'ERROR'
        }

def is_text_file(filepath):
    """判断是否为文本文件"""
    text_extensions = {
        '.txt', '.md', '.py', '.js', '.css', '.json', '.xml', '.csv', '.log',
        '.java', '.cpp', '.c', '.h', '.php', '.rb', '.go', '.rs', '.swift',
        '.kt', '.scala', '.sh', '.bat', '.ps1', '.sql', '.yaml', '.yml',
        '.ini', '.cfg', '.conf', '.toml'
    }
    ext = os.path.splitext(filepath)[1].lower()

    if ext in text_extensions:
        return True

    # 尝试读取文件开头判断是否为文本
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            f.read(1024)
        return True
    except:
        try:
            with open(filepath, 'r', encoding='gbk') as f:
                f.read(1024)
            return True
        except:
            return False

def is_pdf_file(filepath):
    """判断是否为PDF文件"""
    return os.path.splitext(filepath)[1].lower() == '.pdf'

def is_epub_file(filepath):
    """判断是否为EPUB文件"""
    return os.path.splitext(filepath)[1].lower() == '.epub'

def is_html_file(filepath):
    """判断是否为HTML文件"""
    return os.path.splitext(filepath)[1].lower() in {'.html', '.htm'}

def is_code_file(filepath):
    """判断是否为代码文件"""
    code_extensions = {
        '.py', '.js', '.css', '.java', '.cpp', '.c', '.h', '.php', '.rb',
        '.go', '.rs', '.swift', '.kt', '.scala', '.sh', '.bat', '.ps1', '.sql'
    }
    return os.path.splitext(filepath)[1].lower() in code_extensions

def get_language_from_extension(filepath):
    """根据文件扩展名获取语言类型"""
    ext = os.path.splitext(filepath)[1].lower()
    language_map = {
        '.py': 'python',
        '.js': 'javascript',
        '.css': 'css',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.h': 'c',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.sh': 'bash',
        '.bat': 'batch',
        '.ps1': 'powershell',
        '.sql': 'sql',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.json': 'json',
        '.xml': 'xml'
    }
    return language_map.get(ext, 'text')

def get_file_type_label(filepath):
    """获取文件类型标签"""
    ext = os.path.splitext(filepath)[1].lower()

    # 特殊文件类型
    if ext == '.pdf':
        return 'PDF'
    elif ext == '.epub':
        return 'EPUB'
    elif ext == '.md':
        return 'MD'
    elif ext in {'.html', '.htm'}:
        return 'HTML'
    elif ext == '.txt':
        return 'TXT'
    elif ext == '.json':
        return 'JSON'
    elif ext == '.xml':
        return 'XML'
    elif ext == '.csv':
        return 'CSV'
    elif ext == '.log':
        return 'LOG'

    # 编程语言
    elif ext == '.py':
        return 'PY'
    elif ext == '.js':
        return 'JS'
    elif ext == '.css':
        return 'CSS'
    elif ext == '.java':
        return 'JAVA'
    elif ext in {'.cpp', '.cc', '.cxx'}:
        return 'C++'
    elif ext == '.c':
        return 'C'
    elif ext in {'.h', '.hpp'}:
        return 'H'
    elif ext == '.php':
        return 'PHP'
    elif ext == '.rb':
        return 'RUBY'
    elif ext == '.go':
        return 'GO'
    elif ext == '.rs':
        return 'RUST'
    elif ext == '.swift':
        return 'SWIFT'
    elif ext == '.kt':
        return 'KOTLIN'
    elif ext == '.scala':
        return 'SCALA'
    elif ext == '.sh':
        return 'BASH'
    elif ext == '.bat':
        return 'BAT'
    elif ext == '.ps1':
        return 'PS1'
    elif ext == '.sql':
        return 'SQL'
    elif ext in {'.yaml', '.yml'}:
        return 'YAML'

    # 其他
    else:
        return ext.upper().replace('.', '') if ext else 'FILE'

def is_markdown_file(filepath):
    """判断是否为Markdown文件"""
    ext = os.path.splitext(filepath)[1].lower()
    return ext == '.md'

def process_chinese_text(text):
    """处理中文文本，添加段落缩进"""
    # 分割段落
    paragraphs = text.split('\n\n')
    processed_paragraphs = []

    for para in paragraphs:
        para = para.strip()
        if para:
            # 如果不是以特殊字符开头（如标题、列表等），则添加缩进
            if not re.match(r'^[#\-\*\+\d\.]', para) and not para.startswith('```'):
                para = '　　' + para  # 添加两个全角空格作为缩进
            processed_paragraphs.append(para)

    return '\n\n'.join(processed_paragraphs)

def parse_epub(file_path):
    """解析EPUB文件"""
    if not EPUB_SUPPORT:
        return None, "EPUB支持库未安装"

    try:
        book = epub.read_epub(file_path)

        # 获取书籍信息
        title = book.get_metadata('DC', 'title')[0][0] if book.get_metadata('DC', 'title') else "未知标题"
        author = book.get_metadata('DC', 'creator')[0][0] if book.get_metadata('DC', 'creator') else "未知作者"

        # 提取文本内容
        content_parts = []

        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                # 获取HTML内容并简单处理
                html_content = item.get_content().decode('utf-8')

                # 简单的HTML标签清理（保留基本结构）
                import re
                # 移除script和style标签
                html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
                html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)

                content_parts.append(html_content)

        full_content = '\n'.join(content_parts)

        return {
            'title': title,
            'author': author,
            'content': full_content
        }, None

    except Exception as e:
        return None, f"解析EPUB文件失败: {str(e)}"

@app.route('/')
def index():
    """文件列表页面"""
    try:
        current_path = request.args.get('path', '')

        # 使用安全的路径拼接
        if current_path:
            full_path = safe_path_join(ROOT_DIR, current_path)
        else:
            full_path = ROOT_DIR

        if not os.path.exists(full_path):
            logger.warning(f"Path not found: {full_path}")
            abort(404)

        if not os.path.isdir(full_path):
            logger.warning(f"Path is not a directory: {full_path}")
            abort(400)
    
        files = []
        directories = []

        for item in os.listdir(full_path):
            try:
                # 验证文件名安全性
                if not validate_filename(item):
                    logger.warning(f"Invalid filename detected: {item}")
                    continue

                item_path = os.path.join(full_path, item)
                relative_path = os.path.join(current_path, item) if current_path else item

                if os.path.isdir(item_path):
                    directories.append({
                        'name': item,
                        'path': relative_path
                    })
                elif os.path.isfile(item_path):
                    file_info = get_file_info(item_path)
                    file_info['path'] = relative_path
                    files.append(file_info)
            except (OSError, PermissionError) as e:
                logger.warning(f"Error processing item {item}: {e}")
                continue

    except PermissionError:
        logger.error(f"Permission denied accessing: {full_path}")
        abort(403)
    except Exception as e:
        logger.error(f"Error in index route: {e}")
        abort(500)
    
    # 排序
    directories.sort(key=lambda x: x['name'].lower())
    files.sort(key=lambda x: x['name'].lower())
    
    return render_template('index.html', 
                         files=files, 
                         directories=directories,
                         current_path=current_path,
                         parent_path=os.path.dirname(current_path) if current_path else None)

@app.route('/local')
def local_reader():
    """本地文件阅读页面"""
    return render_template('local_reader.html')

@app.route('/upload_local_file', methods=['POST'])
def upload_local_file():
    """处理本地文件上传"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': '没有选择文件'})

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': '没有选择文件'})

        # 验证文件名安全性
        if not validate_filename(file.filename):
            return jsonify({'success': False, 'error': '文件名包含不安全字符'})

        # 生成安全的文件名
        filename = secure_filename(file.filename)
        if not filename:
            return jsonify({'success': False, 'error': '无效的文件名'})

        # 生成唯一的文件名（添加时间戳避免冲突）
        timestamp = str(int(time.time()))
        name, ext = os.path.splitext(filename)
        unique_filename = f"{name}_{timestamp}{ext}"

        # 保存文件到临时目录
        file_path = os.path.join(TEMP_DIR, unique_filename)
        file.save(file_path)

        # 生成阅读URL（使用特殊前缀标识临时文件）
        read_url = f"/read?path=__temp__/{unique_filename}"

        return jsonify({
            'success': True,
            'read_url': read_url,
            'filename': filename
        })

    except Exception as e:
        logger.error(f"Error uploading local file: {e}")
        return jsonify({'success': False, 'error': '文件上传失败'})

@app.route('/read')
def read_file():
    """文件阅读页面"""
    try:
        file_path = request.args.get('path', '')
        if not file_path:
            abort(400)

        # 检查是否为临时文件
        if file_path.startswith('__temp__/'):
            # 处理临时文件
            temp_filename = file_path[9:]  # 移除 '__temp__/' 前缀
            full_path = os.path.join(TEMP_DIR, temp_filename)
        else:
            # 使用安全的路径拼接处理普通文件
            full_path = safe_path_join(ROOT_DIR, file_path)

        if not os.path.exists(full_path):
            logger.warning(f"File not found: {full_path}")
            abort(404)

        if not os.path.isfile(full_path):
            logger.warning(f"Path is not a file: {full_path}")
            abort(400)

        # 检查文件类型并处理
        if is_pdf_file(full_path):
            return render_template('pdf_reader.html',
                                 filename=os.path.basename(file_path),
                                 file_path=file_path)

        elif is_epub_file(full_path):
            # 解析EPUB文件
            epub_data, error = parse_epub(full_path)
            if epub_data:
                return render_template('epub_reader.html',
                                     epub_data=epub_data,
                                     filename=os.path.basename(file_path),
                                     file_path=file_path)
            else:
                return render_template('epub_reader.html',
                                     error=error,
                                     filename=os.path.basename(file_path),
                                     file_path=file_path)

        elif is_html_file(full_path):
            # HTML文件在浏览器中渲染
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    html_content = f.read()
            except UnicodeDecodeError:
                try:
                    with open(full_path, 'r', encoding='gbk') as f:
                        html_content = f.read()
                except:
                    html_content = "无法读取HTML文件内容"

            return render_template('html_reader.html',
                                 html_content=html_content,
                                 filename=os.path.basename(file_path),
                                 file_path=file_path)

        elif not is_text_file(full_path):
            # 其他非文本文件直接下载
            return send_file(full_path, as_attachment=True)

        # 读取文本文件内容
        content = ""
        html_content = ""
        encoding = 'utf-8'
        file_type = 'text'

        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(full_path, 'r', encoding='gbk') as f:
                    content = f.read()
                encoding = 'gbk'
            except:
                content = "无法读取文件内容"

        # 根据文件类型进行不同的处理
        if content != "无法读取文件内容":
            if is_markdown_file(full_path):
                file_type = 'markdown'
                # 处理中文段落缩进
                processed_content = process_chinese_text(content)

                # 配置Markdown扩展，启用代码高亮和表格
                md = markdown.Markdown(extensions=[
                    'markdown.extensions.extra',
                    'markdown.extensions.codehilite',
                    'markdown.extensions.toc',
                    'markdown.extensions.tables',
                    'markdown.extensions.fenced_code',
                    'markdown.extensions.attr_list'
                ], extension_configs={
                    'markdown.extensions.codehilite': {
                        'css_class': 'highlight',
                        'use_pygments': True
                    },
                    'markdown.extensions.tables': {
                        'use_align_attribute': True
                    }
                })

                html_content = md.convert(processed_content)

            elif is_code_file(full_path):
                file_type = 'code'
                language = get_language_from_extension(full_path)

            elif full_path.endswith('.txt'):
                file_type = 'txt'
                # 对txt文件进行段落处理
                content = process_chinese_text(content)

            return render_template('reader.html',
                                 content=content,
                                 html_content=html_content,
                                 file_type=file_type,
                                 language=get_language_from_extension(full_path) if is_code_file(full_path) else None,
                                 filename=os.path.basename(file_path),
                                 file_path=file_path)

    except Exception as e:
        logger.error(f"Error in read_file route: {e}")
        abort(500)

@app.route('/download')
def download_file():
    """文件下载"""
    file_path = request.args.get('path', '')
    if not file_path:
        abort(400)

    full_path = os.path.join(ROOT_DIR, file_path)

    # 安全检查
    if not os.path.abspath(full_path).startswith(os.path.abspath(ROOT_DIR)):
        abort(403)

    if not os.path.exists(full_path):
        abort(404)

    return send_file(full_path, as_attachment=True)

@app.route('/view')
def view_file():
    """文件预览（不下载）"""
    file_path = request.args.get('path', '')
    if not file_path:
        abort(400)

    full_path = os.path.join(ROOT_DIR, file_path)

    # 安全检查
    if not os.path.abspath(full_path).startswith(os.path.abspath(ROOT_DIR)):
        abort(403)

    if not os.path.exists(full_path):
        abort(404)

    # 直接返回文件内容，浏览器会根据MIME类型处理
    return send_file(full_path, as_attachment=False)



@app.after_request
def after_request(response):
    """添加安全和性能相关的HTTP头"""
    # 安全头
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'

    # 缓存控制
    if request.endpoint == 'static':
        response.headers['Cache-Control'] = 'public, max-age=31536000'  # 1年
    elif request.endpoint in ['index', 'read_file']:
        response.headers['Cache-Control'] = 'no-cache, must-revalidate'

    return response

@app.errorhandler(404)
def not_found_error(error):
    """404错误处理"""
    return render_template('error.html',
                         error_code=404,
                         error_message="页面未找到"), 404

@app.errorhandler(403)
def forbidden_error(error):
    """403错误处理"""
    return render_template('error.html',
                         error_code=403,
                         error_message="访问被拒绝"), 403

@app.errorhandler(500)
def internal_error(error):
    """500错误处理"""
    return render_template('error.html',
                         error_code=500,
                         error_message="服务器内部错误"), 500

def cleanup_old_temp_files():
    """清理超过24小时的临时文件"""
    try:
        current_time = time.time()
        for filename in os.listdir(TEMP_DIR):
            file_path = os.path.join(TEMP_DIR, filename)
            if os.path.isfile(file_path):
                # 检查文件修改时间
                file_mtime = os.path.getmtime(file_path)
                if current_time - file_mtime > 24 * 3600:  # 24小时
                    os.remove(file_path)
                    logger.info(f"Cleaned up old temp file: {filename}")
    except Exception as e:
        logger.error(f"Error cleaning up temp files: {e}")

if __name__ == '__main__':
    # 确保目录存在
    os.makedirs(ROOT_DIR, exist_ok=True)
    os.makedirs(TEMP_DIR, exist_ok=True)

    # 清理旧的临时文件
    cleanup_old_temp_files()

    logger.info(f"Starting server with ROOT_DIR: {ROOT_DIR}")
    logger.info(f"Temp directory: {TEMP_DIR}")
    app.run(debug=False, host='0.0.0.0', port=9588)
