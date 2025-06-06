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
import zipfile # Added for CBZ
import io      # Added for serving image data
from urllib.parse import quote, unquote # For encoding/decoding file paths in URLs
import xml.etree.ElementTree as ET # Added for FB2
import base64 # Added for FB2

try:
    import ebooklib
    from ebooklib import epub
    EPUB_SUPPORT = True
    print(f"EPUB support loaded successfully. ebooklib available.")
except ImportError as e:
    EPUB_SUPPORT = False
    print(f"EPUB support failed to load: {e}")

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
    
    is_text_type = is_text_file(filepath)
    is_pdf_type = is_pdf_file(filepath)
    is_epub_type = is_epub_file(filepath)
    is_html_type = is_html_file(filepath)
    is_cbz_type = file_type_label == 'CBZ'
    is_fb2_type = file_type_label == 'FB2'

    # Determine if the file is directly readable/viewable within the app
    is_readable_in_app = is_text_type or is_pdf_type or is_epub_type or is_html_type or is_cbz_type or is_fb2_type
    
    # The 'is_text' key might be used by index.html to show 'Read' button.
    # For now, let's make 'is_readable_in_app' the primary flag for this.
    # We might need to adjust index.html if it strictly uses 'is_text'.
    # As per subtask: use is_readable_in_app and type_label == 'CBZ' for routing.
    # The original 'is_text' for general text files can remain for specific text styling if needed.

    return {
        'name': os.path.basename(filepath),
        'size': size_str,
        'is_text': is_text_type, # Keep original meaning for text-specific handling
        'is_readable_in_app': is_readable_in_app, # New flag for general viewability
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
            'is_readable_in_app': False,
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
    else:
        try:
            with open(filepath, 'rb') as f: # Open in binary mode to read bytes
                chunk = f.read(1024) # Read first 1KB

            encodings_to_try = ['utf-8', 'gbk', 'iso-8859-1']
            for enc in encodings_to_try:
                try:
                    decoded_chunk = chunk.decode(enc)
                    # Heuristic: Check if a good portion is printable,
                    # and doesn't contain too many null bytes (common in binary files).
                    # This is a basic heuristic.
                    if '\\0' in decoded_chunk[:100]: # Check first 100 chars for early null bytes
                        if sum(1 for char in decoded_chunk[:100] if char == '\\0') > 5: # If many nulls, likely binary
                           continue # Try next encoding

                    printable_chars = sum(1 for char in decoded_chunk if char.isprintable() or char.isspace())
                    if len(decoded_chunk) == 0: # Avoid division by zero for empty files
                        return False # Or True, depending on desired behavior for empty files
                    if printable_chars / len(decoded_chunk) > 0.80: # If >80% are printable/space
                        return True
                except UnicodeDecodeError:
                    continue # Try next encoding
            return False # All decoding attempts failed or didn't look like text
        except Exception: # Catch other errors like file not found, permission denied
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
    elif ext == '.cbz':
        return 'CBZ'
    elif ext == '.fb2':
        return 'FB2'
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
    """解析EPUB文件 - 改进版本，支持更好的排版和内容处理"""
    if not EPUB_SUPPORT:
        return None, "EPUB支持库未安装"

    try:
        book = epub.read_epub(file_path)

        # Helper function to safely extract metadata
        def get_meta_value(metadata_list, default="未知"):
            if metadata_list and isinstance(metadata_list, tuple) and len(metadata_list) > 0:
                if isinstance(metadata_list[0], tuple) and len(metadata_list[0]) > 0:
                    return metadata_list[0][0]
                elif isinstance(metadata_list[0], str): # Sometimes it's just a string in a tuple
                    return metadata_list[0]
            elif isinstance(metadata_list, list) and len(metadata_list) > 0: # dc:language can be a list of strings
                 if isinstance(metadata_list[0], tuple) and len(metadata_list[0]) > 0:
                    return metadata_list[0][0]
                 elif isinstance(metadata_list[0], str):
                    return metadata_list[0]
            return default

        # 获取书籍信息
        title = get_meta_value(book.get_metadata('DC', 'title'), "未知标题")
        author = get_meta_value(book.get_metadata('DC', 'creator'), "未知作者")
        publisher = get_meta_value(book.get_metadata('DC', 'publisher'))
        publication_date = get_meta_value(book.get_metadata('DC', 'date'))
        language = get_meta_value(book.get_metadata('DC', 'language'))
        isbn = get_meta_value(book.get_metadata('DC', 'identifier'))

        # 获取目录信息
        toc_items = []
        try:
            for toc_item in book.toc:
                if hasattr(toc_item, 'title') and hasattr(toc_item, 'href'):
                    toc_items.append({
                        'title': toc_item.title,
                        'href': toc_item.href
                    })
        except:
            pass  # 如果获取目录失败，继续处理

        # 按照spine顺序提取内容
        content_parts = []

        try:
            # 尝试按spine顺序处理
            spine_items = book.spine
            for item_id, _ in spine_items:
                # 查找对应的item
                item = None
                for book_item in book.get_items():
                    if book_item.id == item_id:
                        item = book_item
                        break

                if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
                    try:
                        # 获取HTML内容
                        html_content = item.get_content().decode('utf-8')

                        # 改进的HTML处理
                        html_content = clean_epub_html(html_content)

                        if html_content.strip():  # 只添加非空内容
                            content_parts.append(html_content)

                    except Exception as e:
                        logger.warning(f"Failed to process EPUB item {item_id}: {e}")
                        continue
        except Exception as e:
            logger.warning(f"Failed to process spine: {e}")

        # 如果spine方法失败，回退到原来的方法
        if not content_parts:
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    try:
                        html_content = item.get_content().decode('utf-8')
                        html_content = clean_epub_html(html_content)
                        if html_content.strip():
                            content_parts.append(html_content)
                    except Exception as e:
                        logger.warning(f"Failed to process EPUB item: {e}")
                        continue

        full_content = '\n\n'.join(content_parts)

        return {
            'title': title,
            'author': author,
            'publisher': publisher,
            'publication_date': publication_date,
            'language': language,
            'isbn': isbn,
            'content': full_content,
            'toc': toc_items
        }, None

    except Exception as e:
        return None, f"解析EPUB文件失败: {str(e)}"

def clean_epub_html(html_content):
    """清理和改进EPUB HTML内容"""
    import re

    # 移除XML声明和DOCTYPE
    html_content = re.sub(r'<\?xml[^>]*\?>', '', html_content)
    html_content = re.sub(r'<!DOCTYPE[^>]*>', '', html_content)

    # 移除script和style标签
    html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    html_content = re.sub(r'<style[^>]*>.*?</style>', '', html_content, flags=re.DOTALL | re.IGNORECASE)

    # 移除html和body标签，保留内容
    html_content = re.sub(r'<html[^>]*>', '', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'</html>', '', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'<body[^>]*>', '', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'</body>', '', html_content, flags=re.IGNORECASE)
    html_content = re.sub(r'<head[^>]*>.*?</head>', '', html_content, flags=re.DOTALL | re.IGNORECASE)

    # 清理多余的空白
    html_content = re.sub(r'\n\s*\n', '\n\n', html_content)
    html_content = html_content.strip()

    return html_content

@app.route('/')
def index():
    """文件列表页面"""
    try:
        current_path = request.args.get('path', '')
        search_query = request.args.get('q', None)

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
    
        all_files_in_dir = []
        all_directories_in_dir = []

        # Step 1 & 2: Iterate, apply dotfile and validation filters first
        for item_name in os.listdir(full_path):
            if item_name.startswith('.'):
                continue
            if not validate_filename(item_name):
                logger.warning(f"Invalid filename detected during listing: {item_name}")
                continue

            item_path = os.path.join(full_path, item_name)
            relative_item_path = os.path.join(current_path, item_name) if current_path else item_name

            if os.path.isdir(item_path):
                all_directories_in_dir.append({
                    'name': item_name,
                    'path': relative_item_path
                })
            elif os.path.isfile(item_path):
                file_info = get_file_info(item_path)
                # Step 3: Apply supported type filter
                if file_info['is_readable_in_app']:
                    file_info['path'] = relative_item_path
                    all_files_in_dir.append(file_info)
        
        # Step 4: Apply search query if it exists
        if search_query:
            search_query_lower = search_query.lower()
            final_directories = [d for d in all_directories_in_dir if search_query_lower in d['name'].lower()]
            final_files = [f for f in all_files_in_dir if search_query_lower in f['name'].lower()]
        else:
            final_directories = all_directories_in_dir
            final_files = all_files_in_dir

    except PermissionError:
        logger.error(f"Permission denied accessing: {full_path}")
        final_files, final_directories = [], [] # Ensure lists are empty on error
        # abort(403) # Or handle error differently, maybe show message in template
    except Exception as e:
        logger.error(f"Error in index route: {e}")
        final_files, final_directories = [], [] # Ensure lists are empty on error
        # abort(500) # Or handle error differently

    # Sort the final lists
    final_directories.sort(key=lambda x: x['name'].lower())
    final_files.sort(key=lambda x: x['name'].lower())
    
    return render_template('index.html', 
                           files=final_files, 
                           directories=final_directories,
                           current_path=current_path,
                           parent_path=os.path.dirname(current_path) if current_path else None,
                           search_query=search_query)

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

        # Check for CBZ files using the new structure from get_file_info
        file_data_for_read_route = get_file_info(full_path) # Get full info
        if file_data_for_read_route.get('type_label') == 'CBZ' and file_data_for_read_route.get('is_readable_in_app'):
            image_list = get_cbz_image_list(full_path)
            if image_list is None: # Error opening CBZ
                abort(500, description="无法读取CBZ文件内容。")
            encoded_comic_path = quote(file_path)
            return render_template('comic_reader.html', 
                                 filename=os.path.basename(file_path),
                                 comic_file_path_encoded=encoded_comic_path, 
                                 image_list=image_list,
                                 total_pages=len(image_list),
                                 file_path=file_path) # Pass original file_path for recent reads

        # Fallback for general text files or if not specifically handled above
        # The original is_text_file(full_path) check is based on extension or basic sniffing
        if not file_data_for_read_route.get('is_readable_in_app'): # If not any known app-readable type
             # This condition might now be too broad if is_readable_in_app covers all.
             # If it's not text, PDF, EPUB, HTML, CBZ, then download.
            return send_file(full_path, as_attachment=True)
        
        # Ensure it's a text file if it reached here and is_readable_in_app was true but not other types
        if not is_text_file(full_path): 
            # This case should ideally not be reached if logic is correct,
            # means is_readable_in_app was true but it's not PDF, EPUB, HTML, CBZ, FB2 or text.
            logger.warning(f"File {full_path} marked readable but not a known text type, forcing download.")
            return send_file(full_path, as_attachment=True)
        
        if file_data_for_read_route.get('type_label') == 'FB2': # Already checked is_readable_in_app
            fb2_data, error = parse_fb2(full_path)
            if error:
                logger.error(f"FB2 parsing error for {full_path}: {error}")
                abort(500, description=f"FB2解析错误: {error}")
            return render_template('fb2_reader.html',
                                 filename=os.path.basename(file_path),
                                 file_path=file_path,
                                 fb2_data=fb2_data)

        # 读取文本文件内容 (This part is now for .txt, .md, .py etc.)
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

# CBZ related functions
def get_cbz_image_list(cbz_file_path):
    """
    Opens a CBZ file and returns a sorted list of image filenames within it.
    Filters out non-image files and common metadata directories.
    """
    try:
        with zipfile.ZipFile(cbz_file_path, 'r') as zf:
            name_list = zf.namelist()
            
            image_files = []
            valid_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.webp')
            
            for name in name_list:
                # Skip common metadata/directory-like entries from macOS or other tools
                if name.startswith('__MACOSX/') or name.endswith('/'):
                    continue
                if name.lower().endswith(valid_extensions):
                    image_files.append(name)
            
            # Simple alphanumeric sort, consider natsort for more complex cases if allowed
            image_files.sort() 
            return image_files
    except zipfile.BadZipFile:
        logger.error(f"Bad CBZ file: {cbz_file_path}")
        return None
    except Exception as e:
        logger.error(f"Error reading CBZ file {cbz_file_path}: {e}")
        return None

@app.route('/comic_page_data/<path:encoded_comic_file_path>/<path:image_filename>')
def serve_comic_page(encoded_comic_file_path, image_filename):
    """
    Serves a single image from a CBZ file.
    encoded_comic_file_path is the URL-encoded relative path to the CBZ.
    image_filename is the name of the image file within the CBZ.
    """
    try:
        comic_file_rel_path = unquote(encoded_comic_file_path)
        # Ensure image_filename is also unquoted if it was part of path component from URL
        image_filename_decoded = unquote(image_filename)

        # Construct full path to CBZ, ensuring it's within ROOT_DIR
        full_comic_path = safe_path_join(ROOT_DIR, comic_file_rel_path)

        if not os.path.exists(full_comic_path) or not os.path.isfile(full_comic_path):
            logger.error(f"CBZ file not found or not a file: {full_comic_path}")
            abort(404)
        
        # Security check: ensure image_filename doesn't try path traversal (e.g. ../..)
        if '..' in image_filename_decoded or image_filename_decoded.startswith('/'):
            logger.warning(f"Invalid image filename requested: {image_filename_decoded}")
            abort(400)

        with zipfile.ZipFile(full_comic_path, 'r') as zf:
            # Check if the exact image_filename_decoded exists in the archive
            if image_filename_decoded not in zf.namelist():
                 # Fallback: check if original image_filename (potentially still encoded) exists
                 # This might happen if image_filename itself had characters that got URL encoded
                 if image_filename in zf.namelist():
                    image_filename_to_read = image_filename
                 else:
                    logger.error(f"Image {image_filename_decoded} (or {image_filename}) not found in CBZ {comic_file_rel_path}")
                    abort(404)
            else:
                image_filename_to_read = image_filename_decoded

            image_data = zf.read(image_filename_to_read)
            
            # Determine MIME type
            mime_type = 'image/jpeg' # Default
            if image_filename_to_read.lower().endswith('.png'):
                mime_type = 'image/png'
            elif image_filename_to_read.lower().endswith('.gif'):
                mime_type = 'image/gif'
            elif image_filename_to_read.lower().endswith('.webp'):
                mime_type = 'image/webp'
                
            return send_file(io.BytesIO(image_data), mimetype=mime_type)
            
    except zipfile.BadZipFile:
        logger.error(f"Bad CBZ file encountered while serving page: {comic_file_rel_path}")
        abort(500)
    except KeyError: # Image not found in zip
        logger.error(f"Image {image_filename_decoded} not found in CBZ {comic_file_rel_path} (KeyError)")
        abort(404)
    except Exception as e:
        logger.error(f"Error serving comic page for {comic_file_rel_path}, image {image_filename_decoded}: {e}")
        abort(500)

# FB2 parsing functions
FB2_NAMESPACE = {'fb': 'http://www.gribuser.ru/xml/fictionbook/2.0'}

def _get_fb2_text(element, path, default=''):
    """Helper to get text from an FB2 element, handling namespaces."""
    if element is None:
        return default
    found = element.find(path, FB2_NAMESPACE)
    return found.text.strip() if found is not None and found.text else default

def _convert_fb2_node_to_html(node, root_element, binary_cache):
    """
    Recursively converts an FB2 body node and its children to HTML.
    Handles basic tags like p, em, strong, empty-line, and image.
    """
    html_parts = []
    tag_name = node.tag.replace(f"{{{FB2_NAMESPACE['fb']}}}", "") # Remove namespace for easier handling

    if tag_name == 'p':
        html_parts.append('<p>')
        if node.text:
            html_parts.append(node.text)
        for child in node:
            html_parts.append(_convert_fb2_node_to_html(child, root_element, binary_cache))
            if child.tail: # Text after a child element (within the parent <p>)
                html_parts.append(child.tail)
        html_parts.append('</p>')
    elif tag_name == 'em':
        html_parts.append('<em>')
        if node.text: html_parts.append(node.text)
        for child in node: # em can contain other inlines
            html_parts.append(_convert_fb2_node_to_html(child, root_element, binary_cache))
            if child.tail: html_parts.append(child.tail)
        html_parts.append('</em>')
    elif tag_name == 'strong':
        html_parts.append('<strong>')
        if node.text: html_parts.append(node.text)
        for child in node:
            html_parts.append(_convert_fb2_node_to_html(child, root_element, binary_cache))
            if child.tail: html_parts.append(child.tail)
        html_parts.append('</strong>')
    elif tag_name == 'empty-line':
        html_parts.append('<br>')
    elif tag_name == 'section':
        html_parts.append('<div>') # Represent section as a div
        # Sections can have titles, handle them if needed (e.g., <h3>title</h3>)
        title_node = node.find('fb:title', FB2_NAMESPACE)
        if title_node is not None:
            html_parts.append('<h3>')
            # Title can also have <p> inside, or just text
            if title_node.find('fb:p', FB2_NAMESPACE) is not None:
                 for p_node in title_node.findall('fb:p', FB2_NAMESPACE):
                    html_parts.append(_convert_fb2_node_to_html(p_node, root_element, binary_cache))
            elif title_node.text:
                 html_parts.append(title_node.text)
            html_parts.append('</h3>')

        for child in node:
            if child.tag.replace(f"{{{FB2_NAMESPACE['fb']}}}", "") != 'title': # Avoid re-processing title
                 html_parts.append(_convert_fb2_node_to_html(child, root_element, binary_cache))
            if child.tail: html_parts.append(child.tail)
        html_parts.append('</div>')
    elif tag_name == 'image':
        href = node.get('{http://www.w3.org/1999/xlink}href', '')
        if href.startswith('#'):
            image_id = href[1:]
            if image_id in binary_cache: # Use cached image data if available
                img_data_uri = binary_cache[image_id]
                html_parts.append(f'<img src="{img_data_uri}" alt="Image {image_id}" style="max-width:100%; height:auto;"/>')
            else: # Find, decode, cache, and use image data
                binary_node = root_element.find(f".//fb:binary[@id='{image_id}']", FB2_NAMESPACE)
                if binary_node is not None and binary_node.text:
                    content_type = binary_node.get('content-type', 'image/jpeg')
                    try:
                        decoded_image = base64.b64decode(binary_node.text)
                        img_data_uri = f"data:{content_type};base64,{base64.b64encode(decoded_image).decode('utf-8')}"
                        binary_cache[image_id] = img_data_uri # Cache it
                        html_parts.append(f'<img src="{img_data_uri}" alt="Image {image_id}" style="max-width:100%; height:auto;"/>')
                    except Exception as e:
                        logger.error(f"Error decoding base64 image {image_id}: {e}")
                        html_parts.append(f'[Image {image_id} load error]')
                else:
                    html_parts.append(f'[Image {image_id} not found]')
    elif node.text: # Handle plain text content of current node not covered by above
        html_parts.append(node.text)
    
    # Process tail text for current node if it's not a block element like <p> or <section>
    # For block elements, their own text content and children's tails are handled within their logic.
    # if node.tail and tag_name not in ['p', 'section']:
    #     html_parts.append(node.tail)

    return "".join(html_parts)


def parse_fb2(fb2_file_path):
    try:
        tree = ET.parse(fb2_file_path)
        root = tree.getroot()
        
        # Register namespace for easier find operations
        ET.register_namespace('fb', FB2_NAMESPACE['fb'])

        description = root.find('fb:description', FB2_NAMESPACE)
        title_info = description.find('fb:title-info', FB2_NAMESPACE) if description else None
        doc_info = description.find('fb:document-info', FB2_NAMESPACE) if description else None

        metadata = {
            'genre': [_get_fb2_text(g, '.') for g in title_info.findall('fb:genre', FB2_NAMESPACE)] if title_info else [],
            'book_title': _get_fb2_text(title_info, 'fb:book-title', '未知标题'),
            'lang': _get_fb2_text(title_info, 'fb:lang', '未知语言'),
            'version': _get_fb2_text(doc_info, 'fb:version', ''),
            'date': _get_fb2_text(doc_info, 'fb:date', '')
        }
        
        authors = []
        if title_info:
            for author_node in title_info.findall('fb:author', FB2_NAMESPACE):
                authors.append({
                    'first_name': _get_fb2_text(author_node, 'fb:first-name'),
                    'middle_name': _get_fb2_text(author_node, 'fb:middle-name'),
                    'last_name': _get_fb2_text(author_node, 'fb:last-name'),
                    'nickname': _get_fb2_text(author_node, 'fb:nickname')
                })
        metadata['authors'] = authors

        body_node = root.find('fb:body', FB2_NAMESPACE)
        html_content_parts = []
        binary_cache = {} # Cache for decoded images to avoid re-processing

        if body_node is not None:
            if body_node.text: # Text directly under <body> before first <section>
                html_content_parts.append(f"<p>{body_node.text}</p>") # Wrap in <p> for consistent spacing
            for child_node in body_node:
                html_content_parts.append(_convert_fb2_node_to_html(child_node, root, binary_cache))
                if child_node.tail: # Text after a section, wrap in <p>
                    html_content_parts.append(f"<p>{child_node.tail.strip()}</p>")
        
        return {'metadata': metadata, 'html_content': "".join(html_content_parts)}, None
    except ET.ParseError as e:
        logger.error(f"FB2 XML ParseError for {fb2_file_path}: {e}")
        return None, f"XML解析错误: {e}"
    except Exception as e:
        logger.error(f"Error parsing FB2 file {fb2_file_path}: {e}")
        return None, f"FB2文件处理失败: {e}"


@app.route('/favorites')
def favorites_page():
    """收藏夹页面"""
    return render_template('favorites.html')


@app.after_request
def after_request(response):
    """添加安全和性能相关的HTTP头"""
    # 安全头
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
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
