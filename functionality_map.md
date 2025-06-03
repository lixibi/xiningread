## Functionality Map

This section outlines the core functionalities of the XiningRead application, how they interact, typical user flows, and an analysis of its API interfaces.

**1. Core Functionalities & Descriptions:**

*   **File & Directory Browsing:**
    *   **Access:** Root URL (`/`) and parameterized paths (e.g., `/?path=subdirectory`).
    *   **Description:** Displays a hierarchical list of files and subdirectories available within the configured `ROOT_DIR`. It allows navigation up to parent directories via a ".." link. Files are distinguished by type (PDF, EPUB, MD, TXT, etc.) using descriptive labels.
    *   **Implementation:** Handled by the `index()` function in `app.py` and rendered using the `templates/index.html` template.

*   **File Reading/Viewing:**
    *   **Access:** `/read?path=<file_path>` route.
    *   **Description:** Provides the interface for reading various file formats.
        *   **PDF:** Rendered using `templates/pdf_reader.html`, which likely embeds a PDF viewer or leverages native browser capabilities.
        *   **EPUB:** Parsed using the `EbookLib` library. The extracted content is then rendered via `templates/epub_reader.html`.
        *   **HTML:** Displayed directly within the `templates/html_reader.html` template.
        *   **Markdown (.md):** Converted to HTML by the `markdown` library, with support for features like code syntax highlighting (via Pygments) and tables. Chinese text undergoes pre-processing to preserve indentation. Rendered in `templates/reader.html`.
        *   **Code Files (various common extensions):** Displayed with syntax highlighting provided by Pygments, also within `templates/reader.html`.
        *   **Plain Text (.txt):** Displayed in `templates/reader.html`. Similar to Markdown, Chinese text is pre-processed for correct indentation.
    *   **Implementation:** Primarily managed by the `read_file()` function in `app.py`, which determines the file type and selects the appropriate rendering strategy and template.

*   **Reading Experience Customization (Client-Side):**
    *   **Description:** Users can tailor their reading environment through various controls. These include adjusting font size, line height, and toggling between fixed-width and full-width reading modes. A progress indicator shows the reading position. Keyboard shortcuts are available for navigation and these adjustments.
    *   **Implementation:** Driven by JavaScript in `static/js/reader.js` and styled by `static/css/style.css`. These operate on the client-side within the reader templates.

*   **Local File Upload and Reading:**
    *   **Access:** Begins at `/local` (renders `templates/local_reader.html` with an upload form). File submission is to `/upload_local_file` (POST).
    *   **Description:** Allows users to upload files from their local device for reading. Uploaded files are stored in a temporary directory (`TEMP_DIR`) on the server. After a successful upload, the user is redirected to a special read URL (e.g., `/read?path=__temp__/<temp_filename>`) to view the file.
    *   **Implementation:** The `local_reader()` function serves the initial upload page. `upload_local_file()` handles the file upload (POST request) and saving. The `read_file()` function is adapted to serve files from the `__temp__` path.

*   **File Download:**
    *   **Access:** `/download?path=<file_path>`.
    *   **Description:** Enables users to download any file stored within the `ROOT_DIR` directly to their device.
    *   **Implementation:** Handled by the `download_file()` function in `app.py`.

*   **File Preview (View in Browser):**
    *   **Access:** `/view?path=<file_path>`.
    *   **Description:** Attempts to display files directly in the browser if the format is supported (e.g., images, plain text files), rather than initiating an immediate download. This is useful for quick previews.
    *   **Implementation:** Managed by the `view_file()` function in `app.py`.

*   **Error Handling:**
    *   **Description:** The application provides custom error pages for common HTTP errors such as 403 (Forbidden), 404 (Not Found), and 500 (Internal Server Error), enhancing user experience when issues occur.
    *   **Implementation:** Uses `templates/error.html` and specific error handler functions in `app.py` (e.g., `not_found_error()`).

**2. Function Interactions:**

*   **File Browsing (`index`) to Content Delivery:**
    *   From the file listing, users can click a file to read it, triggering the **File Reading/Viewing** (`read_file`) functionality.
    *   Alternatively, users might choose to download a file, invoking the **File Download** (`download_file`) functionality.
*   **Local File Upload Flow:**
    *   The **Local File Upload** process (`local_reader`, `upload_local_file`) directly leads to **File Reading/Viewing** (`read_file`), but with a special path indicating a temporary file.
*   **Client-Side Enhancements:**
    *   Within the **File Reading/Viewing** interface, the **Reading Experience Customization** features (JavaScript-driven) allow users to modify the presentation without needing full page reloads for each adjustment.

**3. Outline User Flow (Conceptual):**

*   **Scenario 1: Reading a Server-Stored File:**
    1.  User navigates to the application's root URL (`/`) to access the Index Page.
    2.  The user is presented with a list of files and folders.
    3.  If the user clicks a folder link, the page reloads, displaying the contents of that folder.
    4.  The user clicks on a specific file link (e.g., "MyBook.pdf" or "MyDocument.txt").
    5.  The application routes the request to `/read?path=<selected_file_path>`.
    6.  The `read_file()` function in `app.py` processes the request, determines the file type.
    7.  The appropriate template (e.g., `pdf_reader.html` for PDFs, `reader.html` for text-based files) is rendered, displaying the file content or an embedded viewer.
    8.  On the reader page, the user can utilize client-side controls (font size, line height, etc.) provided by `static/js/reader.js` to customize their reading experience.

*   **Scenario 2: Reading a Locally Uploaded File:**
    1.  User navigates to the `/local` URL.
    2.  The `local_reader.html` template is rendered, displaying an upload form.
    3.  The user selects a file from their local device and submits the form.
    4.  The file is sent via a POST request to the `/upload_local_file` endpoint.
    5.  The `upload_local_file()` function saves the file to the server's `TEMP_DIR`.
    6.  The server responds with a JSON object containing a `read_url` (e.g., `/read?path=__temp__/uploaded_file_timestamp.txt`).
    7.  Client-side JavaScript in `local_reader.html` receives this response and redirects the browser to the provided `read_url`.
    8.  The `read_file()` function serves the content of the temporary file.
    9.  The user can then interact with the reading controls on the page.

**4. API Interface Analysis:**

While XiningRead is primarily a traditional web application relying on server-side rendering of HTML pages, it does feature one endpoint that functions as a simple API:

*   **`/upload_local_file`**:
    *   **Method:** `POST`
    *   **Request Type:** Multipart form data, expecting a 'file' part containing the uploaded file.
    *   **Function:** Receives the uploaded file, saves it to a temporary server location (`TEMP_DIR`).
    *   **Response (Success):** Returns a JSON object indicating success and providing the URL to read the file, along with the original filename.
        ```json
        {"success": true, "read_url": "/read?path=__temp__/unique_filename.ext", "filename": "original_filename.ext"}
        ```
    *   **Response (Failure):** Returns a JSON object indicating failure and an error message.
        ```json
        {"success": false, "error": "Error message describing the issue"}
        ```
    *   **Usage:** This endpoint is used by the client-side JavaScript on the `/local` page after a user selects and submits a file for upload.

All other routes in the application are primarily designed to serve HTML content directly to the user's browser for navigation and reading, rather than programmatic consumption.
