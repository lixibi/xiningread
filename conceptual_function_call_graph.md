## Conceptual Function Call Graph

This section provides a conceptual overview of the function call chains for key operations within the XiningRead application, focusing on how Flask routes trigger internal functions in `app.py`.

**1. Main Entry Points (Flask Routes):**

The primary entry points into the application are its Flask routes:

*   **`@app.route('/')` -> `index()`**: Handles file and directory listing for the homepage and subdirectories.
*   **`@app.route('/local')` -> `local_reader()`**: Displays the page for uploading local files.
*   **`@app.route('/upload_local_file', methods=['POST'])` -> `upload_local_file()`**: Handles the actual local file upload.
*   **`@app.route('/read')` -> `read_file()`**: Responsible for displaying content of various file types.
*   **`@app.route('/download')` -> `download_file()`**: Handles file downloads.
*   **`@app.route('/view')` -> `view_file()`**: Attempts to display files directly in the browser (e.g., images).
*   **Error Handlers:**
    *   `@app.errorhandler(404)` -> `not_found_error(error)`
    *   `@app.errorhandler(403)` -> `forbidden_error(error)`
    *   `@app.errorhandler(500)` -> `internal_error(error)`

**2. Call Chains for Key Routes (Conceptual):**

*   **Route: `/` (Homepage & File/Directory Listing)**
    *   `index(path=request.args.get('path', ''))`
        *   `current_path = path` (from request arguments)
        *   `full_path = safe_path_join(ROOT_DIR, current_path)`
            *   Internally uses `os.path.normpath`, `os.path.abspath` for security checks.
        *   `os.path.exists(full_path)`
        *   `os.path.isdir(full_path)`
        *   `os.listdir(full_path)` (to get contents of the directory)
        *   For each `item` in the directory listing:
            *   `validate_filename(item)`
            *   `item_path = os.path.join(full_path, item)` (Note: `safe_path_join` is not used here for each item, but `full_path` itself is safe)
            *   `is_dir = os.path.isdir(item_path)`
            *   If not a directory:
                *   `file_info = get_file_info(item_path)`
                    *   `mtime = os.stat(item_path).st_mtime`
                    *   `get_file_info_cached(item_path, mtime)` (This is where the LRU cache is engaged)
                        *   `_get_file_info_internal(item_path)`
                            *   `os.stat(item_path)` (to get size)
                            *   `get_file_type_label(item_path)`
                                *   Calls various `is_<type>_file(item_path)` functions (e.g., `is_pdf_file`, `is_epub_file`, `is_text_file`).
                            *   `is_text_file(item_path)` (and other `is_` functions again for `file_info['is_text']`)
        *   `render_template('index.html', files_list, dirs_list, ...)`

*   **Route: `/read?path=<file_path>` (File Reading/Viewing)**
    *   `read_file(path=request.args.get('path', ''))`
        *   Checks if `path` starts with `__temp__/` (for locally uploaded files):
            *   If yes: `temp_filename = path.split('__temp__/', 1)[1]`
                *   `full_path = os.path.join(TEMP_DIR, temp_filename)` (Security note: `secure_filename` was used on upload, and `TEMP_DIR` is trusted)
            *   If no: `full_path = safe_path_join(ROOT_DIR, path)`
        *   `os.path.exists(full_path)`
        *   `os.path.isfile(full_path)`
        *   **Conditional logic based on file type:**
            *   If `is_pdf_file(full_path)`:
                *   `render_template('pdf_reader.html', pdf_path=path, ...)`
            *   Else if `is_epub_file(full_path)` (and `EPUB_SUPPORT` is True):
                *   `epub_data = parse_epub(full_path)`
                    *   `ebooklib.epub.read_epub(full_path)`
                    *   `book.get_metadata(...)`
                    *   `book.get_items()` (iterates through EPUB contents)
                    *   `item.get_content().decode('utf-8', errors='ignore')`
                    *   `re.sub(r'<script.*?</script>', '', ...)` (for cleaning)
                *   `render_template('epub_reader.html', title, author, content, ...)`
            *   Else if `is_html_file(full_path)`:
                *   `file_content = open(full_path, 'r', encoding='utf-8', errors='ignore').read()`
                *   `render_template('html_reader.html', html_content=file_content, ...)`
            *   Else if `is_text_file(full_path)` (this is a broad category):
                *   `file_content = open(full_path, 'r', encoding='utf-8', errors='ignore').read()` (Fallback to 'gbk' if UTF-8 fails)
                *   If `is_markdown_file(full_path)`:
                    *   `processed_content = process_chinese_text(file_content)`
                    *   `html_content = markdown.Markdown(...).convert(processed_content)`
                *   Else if `is_code_file(full_path)`:
                    *   `language = get_language_from_extension(full_path)`
                    *   (Pygments highlighting is applied within `reader.html` template via Jinja filter `highlight_code` if language is known)
                *   Else if `full_path.endswith('.txt')`: (plain text)
                    *   `processed_content = process_chinese_text(file_content)`
                *   `render_template('reader.html', content_to_render, file_type, language, ...)`
            *   Else (file type not suitable for direct rendering):
                *   `logger.info(f"Non-renderable or non-text file type, attempting to send: {full_path}")`
                *   `send_file(full_path, as_attachment=True)` (Effectively triggers a download)

*   **Route: `/upload_local_file` (POST request)**
    *   `upload_local_file()`
        *   `file = request.files.get('file')`
        *   `validate_filename(file.filename)`
        *   `filename = secure_filename(file.filename)` (from `werkzeug.utils`)
        *   `timestamp = str(int(time.time()))`
        *   `unique_filename = f"{os.path.splitext(filename)[0]}_{timestamp}{os.path.splitext(filename)[1]}"`
        *   `file_path = os.path.join(TEMP_DIR, unique_filename)`
        *   `file.save(file_path)`
        *   `read_url = url_for('read_file', path=f'__temp__/{unique_filename}')`
        *   `jsonify({'success': True, 'read_url': read_url, 'filename': file.filename})`

*   **Route: `/download?path=<file_path>`**
    *   `download_file(path=request.args.get('path', ''))`
        *   `requested_path = os.path.normpath(path)` (Normalizes path)
        *   `full_path = os.path.join(ROOT_DIR, requested_path)`
        *   Security Check: `if not os.path.abspath(full_path).startswith(os.path.abspath(ROOT_DIR)) or '..' in requested_path.split(os.sep):`
            *   (This is a manual implementation similar to `safe_path_join`'s core check but specific to this route)
        *   `os.path.exists(full_path)`
        *   `os.path.isfile(full_path)`
        *   `send_file(full_path, as_attachment=True)`

**3. High-Frequency Utility Functions:**

These functions are called from multiple key routes or are fundamental to processing:

*   **`safe_path_join(base_dir, user_path)`**: Used by `index()`, `read_file()` (for non-temporary files), and `view_file()` to securely construct paths from user input.
*   **`get_file_info(filepath)` (and its cached version `get_file_info_cached` / `_get_file_info_internal`)**: Primarily used by `index()` to gather metadata for every file and directory listed.
*   **File Type Checking Functions (`is_pdf_file()`, `is_epub_file()`, `is_html_file()`, `is_markdown_file()`, `is_code_file()`, `is_text_file()`):** These are extensively used within `read_file()` to determine the appropriate rendering logic and by `get_file_type_label()` (called from `_get_file_info_internal`) to provide type information for listings.
*   **`validate_filename(filename)`**: Used in `index()` when iterating directory contents (though its primary use might be for uploads) and critically in `upload_local_file()`.

**4. Recursive or Complex Call Chains:**

*   **No Direct Recursion:** The application logic does not exhibit direct recursion in its primary call chains.
*   **Conditional Complexity:** The main complexity arises from conditional branching, particularly within the `read_file()` function. This function has a series of `if/elif/else` statements to handle different file types, each leading to a distinct processing path (e.g., calling `parse_epub`, reading raw content, converting Markdown). While not recursive, this creates multiple execution paths within a single entry point.
*   **Chained Helper Functions:** Functions like `get_file_info_cached` -> `_get_file_info_internal` -> `get_file_type_label` -> multiple `is_<type>_file` calls represent a chain of helper functions to achieve a higher-level task (getting file metadata).

This conceptual graph illustrates how user requests are routed and processed through various layers of functions, with security and file type determination being common, recurring themes in the call chains.
