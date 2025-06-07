// 阅读器交互功能 - 针对墨水屏优化

document.addEventListener('DOMContentLoaded', function() {
    const readingArea = document.getElementById('reading-area');
    const contentContainer = document.getElementById('content-container'); // For chunked content
    const fullContentDataSource = document.getElementById('full-content-data');
    const staticFileContent = document.querySelector('.code-block code') || document.querySelector('pre.file-content');

    // 使用模板中设置的activeContentElement，如果没有则使用默认值
    let activeContentElement = window.activeContentElement || contentContainer || staticFileContent;
    console.log("Initial activeContentElement:", activeContentElement, "window.activeContentElement:", window.activeContentElement, "contentType:", window.contentType); // Added initial log

    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    let currentFontSize = 18;
    const fontSmallerBtn = document.getElementById('font-smaller');
    const fontLargerBtn = document.getElementById('font-larger');
    const fullscreenBtn = document.getElementById('fullscreen-browser');
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const bookmarkSaveBtn = document.getElementById('bookmark-save');
    const pageUpBtn = document.getElementById('page-up');
    const pageDownBtn = document.getElementById('page-down');
    const pageNavigation = document.getElementById('page-navigation');
    const controlToggle = document.getElementById('control-toggle');
    const readerControls = document.getElementById('reader-controls');
    let isControlsCollapsed = false;
    
    // Extract file path from URL query parameter (e.g., /read?path=...)
    const urlParams = new URLSearchParams(window.location.search);
    const currentDocumentFilePath = urlParams.get('path'); // This is the key for annotations
    if (currentDocumentFilePath) {
        annotationsManager.setCurrentFile(currentDocumentFilePath);
    }


    // --- Content Chunking Logic (existing) ---
    let fullContent = '';
    let contentType = window.contentType || ''; // 使用模板中设置的contentType
    let chunks = [];
    let currentChunkToRender = 0;
    const LINES_PER_CHUNK_TXT = 50;
    const CHARS_PER_CHUNK_MD = 8000;
    const INITIAL_CHUNKS_TO_LOAD = 2;
    const SCROLL_THRESHOLD = 400;

    if (fullContentDataSource && contentContainer) {
        fullContent = fullContentDataSource.textContent.trim();
        // 如果模板没有设置contentType，则从CSS类推断
        if (!contentType) {
            if (contentContainer.classList.contains('markdown-content')) contentType = 'markdown';
            else if (contentContainer.classList.contains('txt-content')) contentType = 'txt';
            else if (contentContainer.classList.contains('file-content')) contentType = 'plain';
        }
    }
    
    function chunkContent() { /* ... existing chunkContent ... */
        if (!fullContent) return;
        chunks = [];
        if (contentType === 'txt' || contentType === 'plain') {
            const lines = fullContent.split('\n');
            for (let i = 0; i < lines.length; i += LINES_PER_CHUNK_TXT) {
                chunks.push(lines.slice(i, i + LINES_PER_CHUNK_TXT).join('\n'));
            }
        } else if (contentType === 'markdown') {
            for (let i = 0; i < fullContent.length; i += CHARS_PER_CHUNK_MD) {
                let end = i + CHARS_PER_CHUNK_MD;
                if (end < fullContent.length) {
                    let potentialEnd = fullContent.lastIndexOf('>', end);
                    if (potentialEnd > i) end = potentialEnd + 1;
                    else {
                        potentialEnd = fullContent.lastIndexOf(' ', end);
                        if (potentialEnd > i) end = potentialEnd + 1;
                    }
                }
                chunks.push(fullContent.substring(i, Math.min(end, fullContent.length)));
            }
        }
    }

    function renderNextChunk() { /* ... existing renderNextChunk, but call applyAnnotationsAfterChunkRender ... */
        if (currentChunkToRender >= chunks.length || !contentContainer) {
            window.removeEventListener('scroll', throttledScrollHandler);
            applyAnnotationsToRenderedContent(); // Apply any pending annotations once all chunks are done
            return false;
        }
        const chunkHTML = chunks[currentChunkToRender];
        if (contentType === 'txt' || contentType === 'plain') {
            const pre = document.createElement('pre');
            pre.textContent = chunkHTML;
            contentContainer.appendChild(pre);
        } else if (contentType === 'markdown') {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = chunkHTML;
            while(tempDiv.firstChild){ contentContainer.appendChild(tempDiv.firstChild); }
        }
        currentChunkToRender++;
        applyCurrentSettingsToElement(contentContainer);
        console.log(`Chunk ${currentChunkToRender-1} rendered. Applied font size ${currentFontSize}px to contentContainer.`);
        if (contentContainer) {
            console.log(`contentContainer current inline font-size: ${contentContainer.style.fontSize}`);
        }
        updateProgress();
        // Potentially apply annotations to the newly rendered chunk if feasible
        // For simplicity, full re-application might happen after all chunks or on demand
        return true;
    }

    if (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain') {
        chunkContent();
        if (contentContainer) contentContainer.innerHTML = '';
        let loadedInitial = 0;
        for (let i = 0; i < INITIAL_CHUNKS_TO_LOAD && loadedInitial < chunks.length; i++) {
            if(renderNextChunk()) loadedInitial++;
        }
        if (chunks.length > loadedInitial) {
            window.addEventListener('scroll', throttledScrollHandler);
        } else {
            applyAnnotationsToRenderedContent(); // All content loaded initially
            updateProgress();
        }
    } else {
        applyAnnotationsToRenderedContent(); // For non-chunked content
        updateProgress();
    }
    // --- End Content Chunking Logic ---


    // --- Annotation Toolbar & Logic ---
    let selectionToolbar;
    let currentSelectionRange = null;

    function createSelectionToolbar() {
        if (document.getElementById('selection-toolbar')) return;
        selectionToolbar = document.createElement('div');
        selectionToolbar.id = 'selection-toolbar';
        selectionToolbar.style.display = 'none';
        selectionToolbar.style.position = 'absolute';
        selectionToolbar.style.zIndex = '10000';
        // Basic styling, can be moved to CSS
        selectionToolbar.style.background = 'black';
        selectionToolbar.style.border = '1px solid white';
        selectionToolbar.style.padding = '5px';
        selectionToolbar.style.borderRadius = '3px';

        const highlightButton = document.createElement('button');
        highlightButton.textContent = '高亮';
        highlightButton.onclick = () => handleAnnotation('highlight');

        const annotateButton = document.createElement('button');
        annotateButton.textContent = '备注';
        annotateButton.onclick = () => handleAnnotation('note');

        selectionToolbar.appendChild(highlightButton);
        selectionToolbar.appendChild(annotateButton);
        document.body.appendChild(selectionToolbar);
    }

    function showSelectionToolbar(x, y) {
        if (!selectionToolbar) createSelectionToolbar();
        selectionToolbar.style.left = `${x}px`;
        selectionToolbar.style.top = `${y}px`;
        selectionToolbar.style.display = 'flex';
    }

    function hideSelectionToolbar() {
        if (selectionToolbar) selectionToolbar.style.display = 'none';
    }

    if (readingArea) {
        readingArea.addEventListener('mouseup', function(e) {
            setTimeout(() => { // Allow selection to finalize
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                    currentSelectionRange = selection.getRangeAt(0);
                    // Ensure selection is within the readable content area
                    if (contentContainer && contentContainer.contains(currentSelectionRange.commonAncestorContainer)) {
                         // Check if selection is not on an existing annotation span directly
                        if (currentSelectionRange.startContainer.nodeType === Node.ELEMENT_NODE && currentSelectionRange.startContainer.classList.contains('highlighted-text')) {
                            // Don't show toolbar if clicking on an existing highlight
                            hideSelectionToolbar();
                            return;
                        }
                        showSelectionToolbar(e.clientX + window.scrollX, e.clientY + window.scrollY + 10);
                    } else {
                        hideSelectionToolbar();
                    }
                } else {
                    hideSelectionToolbar();
                }
            }, 10);
        });
    }
    document.addEventListener('mousedown', function(e) { // Hide toolbar if clicking elsewhere
        if (selectionToolbar && selectionToolbar.style.display === 'flex' && !selectionToolbar.contains(e.target)) {
             // Check if the click is outside the toolbar and not on selected text
            const selection = window.getSelection();
            if (selection.isCollapsed || !readingArea.contains(selection.anchorNode)) {
                 hideSelectionToolbar();
            }
        }
    });


    function getTXTSelectionRangeData(range) {
        if (!contentContainer || !fullContent) return null;
        // Assumes contentContainer contains <pre> tags for each chunk of TXT
        // This needs to account for the full, unchunked text content.

        let charCountUpToRangeStart = 0;
        const preElements = Array.from(contentContainer.querySelectorAll('pre'));
        let foundStart = false;

        // Calculate start offset based on full text
        let tempRange = document.createRange();
        tempRange.selectNodeContents(contentContainer); // Select all content within container
        tempRange.setEnd(range.startContainer, range.startOffset);
        const textBeforeSelection = tempRange.toString();
        const startOffset = textBeforeSelection.length;

        const selectedText = range.toString();
        const endOffset = startOffset + selectedText.length;

        return { type: 'txt-char-offset', startOffset, endOffset, selectedText };
    }

    function getPathTo(node) {
        // 生成节点的简单路径
        if (!node || node === document) return '';

        let path = '';
        let current = node;

        while (current && current !== document) {
            if (current.id) {
                path = `id("${current.id}")` + (path ? '/' + path : '');
                break;
            } else if (current.tagName) {
                let tagName = current.tagName.toLowerCase();
                let siblings = Array.from(current.parentNode?.children || []).filter(el => el.tagName === current.tagName);
                let index = siblings.indexOf(current) + 1;
                path = `${tagName}[${index}]` + (path ? '/' + path : '');
            }
            current = current.parentNode;
        }

        return path;
    }

    function getMDSelectionRangeData(range) {
        // Simplified: store selected text and its context.
        // More robust: path to start/end containers and offsets.
        const selectedText = range.toString().trim();
        if (!selectedText) return null;

        let startNode = range.startContainer;
        let endNode = range.endContainer;

        // Try to get a path for start and end nodes
        // This is very basic; real path generation is complex
        const startNodePath = getPathTo(startNode);
        const endNodePath = getPathTo(endNode);

        return {
            type: 'md-html',
            startNodePath: startNodePath,
            startOffset: range.startOffset,
            endNodePath: endNodePath,
            endOffset: range.endOffset,
            selectedText: selectedText
        };
    }


    function applyHighlight(range, noteId, color = 'yellow', noteType = 'highlight') {
        if (range.collapsed) return;

        const span = document.createElement('span');
        span.className = 'highlighted-text';
        span.style.backgroundColor = color;
        span.dataset.noteId = noteId;
        if (noteType === 'note') {
            span.classList.add('annotated-text'); // For different styling or click handling
        }

        try {
            // If selection spans multiple nodes, surroundContents might fail for some complex cases.
            // A more robust way is to iterate through text nodes in the range and wrap them.
            if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                 range.surroundContents(span);
            } else {
                // Iterate over parts of the range if it spans multiple elements
                const fragment = range.extractContents();
                span.appendChild(fragment);
                range.insertNode(span);
            }
        } catch (e) {
            console.error("Error applying highlight with surroundContents:", e);
            // Fallback or more granular node walking and wrapping would be needed here
            // For now, just log and skip if complex range fails
            return;
        }
    }


    function handleAnnotation(type) {
        if (!currentSelectionRange) return;

        let rangeData;
        if (contentType === 'txt' || contentType === 'plain') {
            rangeData = getTXTSelectionRangeData(currentSelectionRange);
        } else if (contentType === 'markdown') {
            rangeData = getMDSelectionRangeData(currentSelectionRange);
        } else {
            console.warn("Annotation not supported for this content type:", contentType);
            hideSelectionToolbar();
            return;
        }

        if (!rangeData) {
            console.warn("Could not generate range data for annotation.");
            hideSelectionToolbar();
            return;
        }

        let comment = "";
        if (type === 'note') {
            comment = prompt("输入您的备注:", "");
            if (comment === null) { // User cancelled
                hideSelectionToolbar();
                window.getSelection().removeAllRanges();
                return;
            }
        }

        const note = {
            type: type,
            text: rangeData.selectedText || currentSelectionRange.toString(), // Ensure selectedText is stored
            comment: comment,
            color: (type === 'note' ? 'lightblue' : 'yellow'), // Example colors
            rangeData: rangeData,
            timestamp: new Date().toISOString()
        };

        const savedNote = annotationsManager.addNote(note);
        if (savedNote) {
            applyHighlight(currentSelectionRange, savedNote.id, savedNote.color, savedNote.type);
        }
        
        hideSelectionToolbar();
        if (window.getSelection) window.getSelection().removeAllRanges(); // Clear selection
    }

    function restoreTXTAnnotation(note) {
        if (!contentContainer || !fullContent || note.rangeData.type !== 'txt-char-offset') return;

        const { startOffset, endOffset } = note.rangeData;
        let accumulatedOffset = 0;
        let startNode = null, startNodeOffset = 0;
        let endNode = null, endNodeOffset = 0;

        // Find start and end nodes/offsets based on character offsets from fullContent
        // This needs to iterate through the text nodes of all <pre> child elements if chunked
        function findNodeAndOffset(targetGlobalOffset) {
            let currentGlobalOffset = 0;
            const preElements = Array.from(contentContainer.querySelectorAll('pre'));
            if (preElements.length === 0 && contentContainer.firstChild && contentContainer.firstChild.nodeType === Node.TEXT_NODE) {
                // Not chunked, or single text node in contentContainer itself (less likely with <pre> per chunk)
                if (targetGlobalOffset <= contentContainer.firstChild.textContent.length) {
                    return { node: contentContainer.firstChild, offset: targetGlobalOffset };
                }
                return null; // Offset out of bounds
            }

            for (const pre of preElements) {
                const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    const nodeLength = node.textContent.length;
                    if (targetGlobalOffset >= currentGlobalOffset && targetGlobalOffset <= currentGlobalOffset + nodeLength) {
                        return { node: node, offset: targetGlobalOffset - currentGlobalOffset };
                    }
                    currentGlobalOffset += nodeLength;
                }
                // Account for newlines between <pre> if they were part of original fullContent and not in <pre> textContent
                // This part is tricky and depends on how fullContent was constructed vs. how it's put in DOM.
                // Assuming newlines are within the <pre> textContent due to .join('\n') in chunking.
            }
            return null; // Offset not found
        }

        const startPos = findNodeAndOffset(startOffset);
        const endPos = findNodeAndOffset(endOffset);

        if (startPos && endPos) {
            try {
                const range = document.createRange();
                range.setStart(startPos.node, startPos.offset);
                range.setEnd(endPos.node, endPos.offset);
                applyHighlight(range, note.id, note.color, note.type);
            } catch (e) {
                console.error("Error restoring TXT annotation range:", e, note);
            }
        } else {
            console.warn("Could not find nodes for TXT annotation:", note);
        }
    }
    
    function restoreMDAnnotation(note) {
        if (!contentContainer || note.rangeData.type !== 'md-html') return;
        // Simplified MD restoration: find text and highlight. Very fragile.
        // This would need the robust path-based or advanced context search.
        // For now, this part will be mostly non-functional or highly limited.
        // A very basic attempt:
        const { selectedText, startNodePath, startOffset, endNodePath, endOffset } = note.rangeData;

        function getNodeByPath(pathStr) { // Very simplified version of XPath eval
            try {
                if (pathStr.startsWith('id("')) {
                    const id = pathStr.match(/id\("([^"]+)"\)/)[1];
                    return document.getElementById(id);
                }
                // This simplified path like 'body/div[1]/p[2]' needs a real parser.
                // For now, this part of MD restoration is effectively disabled.
                let current = document;
                const parts = pathStr.split('/');
                for(const part of parts){
                    if(!current) return null;
                    // This is not how to parse 'p[1]', just a placeholder
                    const match = part.match(/(\w+)(?:\[(\d+)\])?/);
                    if(!match) return null;
                    const tagName = match[1].toUpperCase();
                    const index = match[2] ? parseInt(match[2],10) -1 : 0;
                    let count = 0;
                    let found = false;
                    for(const child of current.childNodes){
                        if(child.nodeType === Node.ELEMENT_NODE && child.tagName === tagName){
                            if(count === index){
                                current = child;
                                found = true;
                                break;
                            }
                            count++;
                        }
                    }
                    if(!found) return null;
                }
                return current;

            } catch (e) { console.error("Error in getNodeByPath", e); return null; }
        }

        const startContainer = getNodeByPath(startNodePath);
        const endContainer = getNodeByPath(endNodePath);

        if (startContainer && endContainer && typeof startOffset === 'number' && typeof endOffset === 'number') {
             try {
                const range = document.createRange();
                // Ensure nodes are text nodes or have sufficient children for offset
                if ( (startContainer.nodeType === Node.TEXT_NODE || startContainer.childNodes.length > startOffset) &&
                     (endContainer.nodeType === Node.TEXT_NODE || endContainer.childNodes.length > endOffset) ) {

                    // Check if nodeValue is null before accessing length
                    const startNodeLength = startContainer.nodeValue ? startContainer.nodeValue.length : (startContainer.childNodes ? startContainer.childNodes.length : 0);
                    const endNodeLength = endContainer.nodeValue ? endContainer.nodeValue.length : (endContainer.childNodes ? endContainer.childNodes.length : 0);

                    if (startOffset <= startNodeLength && endOffset <= endNodeLength) {
                        range.setStart(startContainer, startOffset);
                        range.setEnd(endContainer, endOffset);
                        if (range.toString().trim() === selectedText) { // Verify text content
                            applyHighlight(range, note.id, note.color, note.type);
                        } else {
                            console.warn("MD annotation text mismatch, skipping:", note.selectedText, "vs", range.toString());
                        }
                    } else {
                         console.warn("MD annotation offset out of bounds:", note);
                    }
                } else {
                     console.warn("MD annotation node type or child count issue:", note);
                }

            } catch (e) {
                console.error("Error restoring MD annotation range:", e, note);
            }
        } else {
             console.warn("Could not find nodes for MD annotation or invalid offsets:", note);
        }
    }


    function applyAnnotationsToRenderedContent() {
        if (!currentDocumentFilePath) return;

        // 检查annotationsManager是否可用
        if (typeof annotationsManager === 'undefined') {
            console.warn('annotationsManager not available, skipping annotations');
            return;
        }

        // 使用activeContentElement或contentContainer，确保不为null
        const targetContainer = activeContentElement || contentContainer;
        if (!targetContainer) {
            console.warn('No target container found for annotations');
            return;
        }

        // Clear existing visual highlights first to avoid duplicates if called multiple times
        try {
            targetContainer.querySelectorAll('.highlighted-text').forEach(span => {
                // Unwrap content from span
                const parent = span.parentNode;
                while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                }
                parent.removeChild(span);
                parent.normalize(); // Merge adjacent text nodes
            });
        } catch (e) {
            console.error('Error clearing existing highlights:', e);
            return;
        }

        try {
            const notes = annotationsManager.getNotesForCurrentFile();
            notes.forEach(note => {
                if (note.rangeData) {
                    if (note.rangeData.type === 'txt-char-offset' && (contentType === 'txt' || contentType === 'plain')) {
                        restoreTXTAnnotation(note);
                    } else if (note.rangeData.type === 'md-html' && contentType === 'markdown') {
                        restoreMDAnnotation(note);
                    }
                }
            });
        } catch (e) {
            console.error('Error applying annotations:', e);
        }
    }
    
    // Initial load of annotations after content is ready (or sufficiently ready for chunked)
    // This is called from the chunking logic when appropriate.
    // If not chunking, call it after loadSettings/restoreReadingPosition.

    // --- Existing reader.js functionalities (font, fullscreen, bookmark, etc.) ---
    // Ensure they use `activeContentElement` for styling if applicable.
    // ... (Most of the existing code from reader.js, adapted to use activeContentElement where needed) ...

    function applyCurrentSettingsToElement(element) {
        console.log("applyCurrentSettingsToElement called with:", element, "Current font size:", currentFontSize, "ContentType:", contentType); // Added log
        if (element) {
            element.style.setProperty('font-size', currentFontSize + 'px', 'important');
            console.log(`Applied font-size ${currentFontSize}px to element:`, element);
            if (element.style.fontSize) {
                console.log(`Element's inline font-size after setProperty: ${element.style.fontSize}`);
            } else {
                console.log(`Element's inline font-size is not set directly after setProperty (might be in CSSStyleDeclaration).`);
            }

            // For EPUB, applying to the main container (#epub-content) should be enough if children inherit.
            // The '!important' flag should help override internal EPUB styles.
            // No longer iterating child elements for EPUBs, relying on inheritance from the main 'element'.
            // If specific EPUB elements still don't resize, it might be due to very specific CSS within the EPUB
            // or elements not being children of the 'element' passed to this function.
        } else {
            console.warn("applyCurrentSettingsToElement: element is null or undefined.");
        }
    }

    // 将函数暴露到全局作用域，以便模板中可以访问
    window.applyCurrentSettingsToElement = applyCurrentSettingsToElement;
    window.updateProgress = updateProgress;
    if (fontSmallerBtn && fontLargerBtn) { // Check for activeContentElement inside event listener
        fontSmallerBtn.addEventListener('click', () => {
            console.log("Font-smaller button clicked. Current activeContentElement:", activeContentElement, "Current font size:", currentFontSize);
            if (!activeContentElement) {
                console.error("Cannot change font size: activeContentElement is null.");
                return;
            }
            if (currentFontSize > 12) {
                currentFontSize -= 2;
                applyCurrentSettingsToElement(activeContentElement);
                console.log(`Font size changed to ${currentFontSize}px. Target element:`, activeContentElement);
                if (activeContentElement && activeContentElement.style) {
                     console.log(`Target element inline font-size after change: ${activeContentElement.style.fontSize}`);
                }
                saveSettings();
            }
        });
        fontLargerBtn.addEventListener('click', () => {
            console.log("Font-larger button clicked. Current activeContentElement:", activeContentElement, "Current font size:", currentFontSize);
            if (!activeContentElement) {
                console.error("Cannot change font size: activeContentElement is null.");
                return;
            }
            if (currentFontSize < 32) {
                currentFontSize += 2;
                applyCurrentSettingsToElement(activeContentElement);
                console.log(`Font size changed to ${currentFontSize}px. Target element:`, activeContentElement);
                if (activeContentElement && activeContentElement.style) {
                     console.log(`Target element inline font-size after change: ${activeContentElement.style.fontSize}`);
                }
                saveSettings();
            }
        });
    }
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function() {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });
        document.addEventListener('fullscreenchange', function() {
            console.log('Fullscreen state changed. document.fullscreenElement:', document.fullscreenElement); // Keep this log for now
            fullscreenBtn.textContent = document.fullscreenElement ? '🔲 退出全屏' : '🔳 浏览器全屏';
            if (document.fullscreenElement) {
                document.body.classList.add('fullscreen-mode');
                console.log('Added fullscreen-mode class to body.'); // Keep this
            } else {
                document.body.classList.remove('fullscreen-mode');
                console.log('Removed fullscreen-mode class from body.'); // Keep this
            }
        });
    }
    if (controlToggle && readerControls) { /* ... existing control toggle logic ... */
        controlToggle.addEventListener('click', function() {
            isControlsCollapsed = !isControlsCollapsed;
            readerControls.classList.toggle('collapsed', isControlsCollapsed);
            controlToggle.textContent = isControlsCollapsed ? '⚙️ 展开设置' : '⚙️ 收起设置';
            saveSettings();
        });
    }
    // 翻页按钮事件监听器 - 确保在DOM完全加载后绑定
    function setupPageNavigation() {
        const pageUpBtn = document.getElementById('page-up');
        const pageDownBtn = document.getElementById('page-down');

        console.log('Setting up page navigation. pageUpBtn:', pageUpBtn, 'pageDownBtn:', pageDownBtn); // 调试日志

        if (pageUpBtn) {
            // 移除可能存在的旧事件监听器
            pageUpBtn.removeEventListener('click', pageUpHandler);
            pageUpBtn.addEventListener('click', pageUpHandler);
            console.log('Page up button event listener added'); // 调试日志
        } else {
            console.warn('Page up button not found!'); // 调试日志
        }

        if (pageDownBtn) {
            // 移除可能存在的旧事件监听器
            pageDownBtn.removeEventListener('click', pageDownHandler);
            pageDownBtn.addEventListener('click', pageDownHandler);
            console.log('Page down button event listener added'); // 调试日志
        } else {
            console.warn('Page down button not found!'); // 调试日志
        }
    }

    // 定义事件处理函数，避免重复绑定
    function pageUpHandler(e) {
        e.preventDefault();
        console.log('Page up clicked'); // 调试日志
        window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
    }

    function pageDownHandler(e) {
        e.preventDefault();
        console.log('Page down clicked'); // 调试日志
        window.scrollBy({ top: (window.innerHeight * 0.8), behavior: 'smooth' });
    }

    // 立即设置翻页按钮
    setupPageNavigation();

    // 设置翻页按钮拖拽功能
    function setupDragNavigation() {
        const pageNavigation = document.getElementById('page-navigation');
        if (pageNavigation) {
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };

            pageNavigation.addEventListener('mousedown', function(e) {
                if (e.target === pageNavigation) {
                    isDragging = true;
                    const rect = pageNavigation.getBoundingClientRect();
                    dragOffset.x = e.clientX - rect.left;
                    dragOffset.y = e.clientY - rect.top;
                    e.preventDefault();
                }
            });

            // 防止按钮点击时触发拖拽
            const pageUpBtn = document.getElementById('page-up');
            const pageDownBtn = document.getElementById('page-down');
            const bookmarkSaveBtn = document.getElementById('bookmark-save');

            [pageUpBtn, pageDownBtn, bookmarkSaveBtn].forEach(btn => {
                if (btn) btn.addEventListener('mousedown', e => e.stopPropagation());
            });

            document.addEventListener('mousemove', function(e) {
                if (isDragging) {
                    let x = e.clientX - dragOffset.x;
                    let y = e.clientY - dragOffset.y;
                    const maxX = window.innerWidth - pageNavigation.offsetWidth;
                    const maxY = window.innerHeight - pageNavigation.offsetHeight;
                    pageNavigation.style.right = 'auto';
                    pageNavigation.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
                    pageNavigation.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
                    pageNavigation.style.transform = 'none';
                }
            });

            document.addEventListener('mouseup', function() {
                isDragging = false;
            });
        }
    }

    // 设置拖拽功能
    setupDragNavigation();
    
    // 书签功能实现
    function getBookmarkKey() {
        return 'bookmark_' + btoa(window.location.href);
    }

    function getCurrentScrollProgress() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    }

    function saveBookmark() {
        const key = getBookmarkKey();
        const bookmarkData = {
            scrollPosition: window.pageYOffset,
            progress: getCurrentScrollProgress(),
            timestamp: new Date().toISOString(),
            url: window.location.href,
            fontSize: currentFontSize
        };
        console.log(`[saveBookmark] Preparing to save bookmark for key "${key}":`, bookmarkData);
        try {
            localStorage.setItem(key, JSON.stringify(bookmarkData));
            console.log(`[saveBookmark] Bookmark saved successfully for key "${key}".`);

            // 更新书签按钮状态
            if (bookmarkBtn) {
                bookmarkBtn.textContent = '🔖 已保存书签';
                bookmarkBtn.style.backgroundColor = '#4CAF50';
                setTimeout(() => {
                    bookmarkBtn.textContent = '🔖 书签';
                    bookmarkBtn.style.backgroundColor = '';
                }, 2000);
            }
        } catch (e) {
            console.error(`[saveBookmark] Error saving bookmark for key "${key}":`, e);
        }
    }

    function loadBookmark() {
        const key = getBookmarkKey();
        const saved = localStorage.getItem(key);
        console.log(`[loadBookmark] Attempting to load bookmark for key "${key}". Saved data:`, saved ? "Found" : "Not found");

        if (saved) {
            try {
                const bookmarkData = JSON.parse(saved);
                console.log('[loadBookmark] Parsed bookmark data:', bookmarkData);
                console.log(`[loadBookmark] Current activeContentElement before timeout:`, activeContentElement);
                console.log(`[loadBookmark] Document scrollHeight before timeout: ${document.documentElement.scrollHeight}`);


                setTimeout(() => {
                    console.log(`[loadBookmark internal] Executing setTimeout. Target scrollPosition: ${bookmarkData.scrollPosition}, Target fontSize: ${bookmarkData.fontSize}`);
                    console.log(`[loadBookmark internal] activeContentElement inside timeout:`, activeContentElement);
                    console.log(`[loadBookmark internal] Document scrollHeight inside timeout (before scroll): ${document.documentElement.scrollHeight}`);

                    window.scrollTo(0, bookmarkData.scrollPosition);
                    console.log(`[loadBookmark internal] Scrolled to: ${bookmarkData.scrollPosition}. Current window.pageYOffset: ${window.pageYOffset}`);

                    if (bookmarkData.fontSize && currentFontSize !== bookmarkData.fontSize) {
                        console.log(`[loadBookmark internal] Restoring font size from bookmark: ${bookmarkData.fontSize}. Current font size: ${currentFontSize}`);
                        currentFontSize = bookmarkData.fontSize;
                        if (activeContentElement) {
                            applyCurrentSettingsToElement(activeContentElement);
                            console.log(`[loadBookmark internal] Applied font size ${currentFontSize} to activeContentElement.`);
                        } else {
                            console.warn('[loadBookmark internal] activeContentElement is null, cannot apply bookmarked font size.');
                        }
                        saveSettings(); // Also save this newly applied font size as current setting
                    } else if (bookmarkData.fontSize) {
                        console.log(`[loadBookmark internal] Font size in bookmark (${bookmarkData.fontSize}) is same as current (${currentFontSize}). No change needed.`);
                    }
                }, 250); // 250ms delay
                return true;
            } catch (e) {
                console.error(`[loadBookmark] Error loading or applying bookmark for key "${key}":`, e);
                return false;
            }
        }
        return false;
    }

    function hasBookmark() {
        const key = getBookmarkKey();
        const has = localStorage.getItem(key) !== null;
        console.log(`[hasBookmark] Checking for key "${key}". Found: ${has}`);
        return has;
    }

    // 书签按钮事件
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', function() {
            if (hasBookmark()) {
                if (!loadBookmark() && confirm('是否更新书签到当前位置？')) {
                    saveBookmark();
                }
            } else {
                saveBookmark();
            }
        });
    }
    if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener('click', saveBookmark);
    
    function updateProgress() { /* ... (existing updateProgress, adapted for chunking) ... */
        let progress = 0;
        if (chunks.length > 0 && (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain')) {
             progress = (currentChunkToRender / chunks.length) * 100;
             if (currentChunkToRender === chunks.length && chunks.length > 0) progress = 100; // Ensure 100% when all loaded
        } else {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : (document.body.scrollHeight > 0 ? 100 : 0) ;
        }
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
    }

    // 滚动处理函数
    function handleScroll() {
        updateProgress();

        // 检查是否需要加载更多内容块（仅对分块内容类型）
        if (chunks.length > currentChunkToRender && (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain')) {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;

            // 当滚动到接近底部时加载下一块内容
            if (scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD) {
                renderNextChunk();
            }
        }
    }

    // 节流的滚动处理器
    const throttledScrollHandler = throttle(handleScroll, 100);
    
    window.addEventListener('scroll', throttledScrollHandler); // Combined scroll handler
    document.addEventListener('keydown', function(e) { /* ... existing keydown logic ... */
        if (e.ctrlKey && e.key === 'ArrowUp') {
            e.preventDefault();
            if(fontLargerBtn) fontLargerBtn.click();
        }
        else if (e.ctrlKey && e.key === 'ArrowDown') {
            e.preventDefault();
            if(fontSmallerBtn) fontSmallerBtn.click();
        }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            console.log('Keyboard page up triggered'); // 调试日志
            window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
        }
        else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            e.preventDefault();
            console.log('Keyboard page down triggered'); // 调试日志
            window.scrollBy({ top: (window.innerHeight * 0.8), behavior: 'smooth' });
        }
        else if (e.key === 'Home') {
            window.scrollTo(0, 0);
            e.preventDefault();
        }
        else if (e.key === 'End') {
            window.scrollTo(0, document.body.scrollHeight);
            e.preventDefault();
        }
        else if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if(fullscreenBtn) fullscreenBtn.click();
        }
        // Help panel toggle
        if (e.key === 'F1' || (e.key === '?' && e.shiftKey)) {
            e.preventDefault();
            helpVisible = !helpVisible;
            document.getElementById('help-panel').style.display = helpVisible ? 'block' : 'none';
        }
    });

    function saveSettings() { /* ... existing saveSettings ... */
        localStorage.setItem('readerSettings', JSON.stringify({ fontSize: currentFontSize, controlsCollapsed: isControlsCollapsed }));
    }
    function loadSettings() {
        const saved = localStorage.getItem('readerSettings');
        console.log("loadSettings called. current activeContentElement:", activeContentElement, "contentType:", contentType);
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                currentFontSize = settings.fontSize || 18;
                isControlsCollapsed = settings.controlsCollapsed || false;
                console.log("Loaded settings: fontSize =", currentFontSize, "controlsCollapsed =", isControlsCollapsed);
                if (activeContentElement) {
                    applyCurrentSettingsToElement(activeContentElement);
                } else {
                    console.warn("loadSettings: activeContentElement is null, cannot apply font size yet.");
                }
                if (readerControls && controlToggle) {
                    readerControls.classList.toggle('collapsed', isControlsCollapsed);
                    controlToggle.textContent = isControlsCollapsed ? '⚙️ 展开设置' : '⚙️ 收起设置';
                }
            } catch (e) { console.error('Error loading reader settings:', e); }
        } else {
            console.log("No saved settings found, applying default font size.");
            if (activeContentElement) {
                applyCurrentSettingsToElement(activeContentElement); // Apply default
            } else {
                console.warn("loadSettings: activeContentElement is null, cannot apply default font size yet.");
            }
        }
    }
    function saveReadingPosition() { /* ... existing saveReadingPosition ... */
         localStorage.setItem('readingPosition_' + btoa(window.location.href), window.pageYOffset);
    }
    function restoreReadingPosition() { /* ... existing restoreReadingPosition ... */
        const saved = localStorage.getItem('readingPosition_' + btoa(window.location.href));
        if (saved) setTimeout(() => window.scrollTo(0, parseInt(saved)), 150); // increased delay for chunked content
    }
    window.addEventListener('beforeunload', saveReadingPosition);

    loadSettings();

    // 根据内容类型决定初始化流程
    if (contentType === 'epub') {
        // EPUB内容的特殊处理
        setTimeout(() => {
            if (hasBookmark()) {
                loadBookmark();
            } else {
                restoreReadingPosition();
            }
            updateProgress();
            applyAnnotationsToRenderedContent();
        }, 200);
    } else if (! (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain') || chunks.length <= INITIAL_CHUNKS_TO_LOAD) {
        setTimeout(() => { if (hasBookmark()) loadBookmark(); else restoreReadingPosition(); updateProgress(); applyAnnotationsToRenderedContent(); }, 200);
    } else {
         setTimeout(() => { updateProgress(); }, 100);
         if (hasBookmark()) loadBookmark(); else restoreReadingPosition();
         // Annotations for chunked content will be (re)applied as chunks load or fully at the end by renderNextChunk
    }

    // Help Panel
    const helpText = document.createElement('div'); /* ... existing help panel HTML ... */
    helpText.innerHTML = `<div style="position: fixed; bottom: 10px; right: 10px; background: #fff; border: 2px solid #000; padding: 10px; font-size: 12px; display: none; z-index: 10001;" id="help-panel"><strong>快捷键:</strong><br>Ctrl+↑/↓: 调整字体<br>Ctrl+F: 浏览器全屏<br>←/→/PageUp/PageDown: 翻页<br>Home/End: 跳转首尾<br>F1 or Shift+?: 显示/隐藏帮助<br><br><strong>操作:</strong><br>翻页按钮可拖动<br>工具栏可收起<br>🔖书签: 保存/跳转位置<br>💾: 快速保存书签</div>`;
    document.body.appendChild(helpText);
    let helpVisible = false; // Already declared by keydown listener for F1

    if (activeContentElement) {
        applyCurrentSettingsToElement(activeContentElement);
        console.log("Applied initial font settings in DOMContentLoaded if activeContentElement was present.");
    } else {
        console.warn("DOMContentLoaded: activeContentElement is null at the end of initial setup, font size might not be applied until it's set by templates.");
    }
    createSelectionToolbar(); // Create the toolbar so it's ready

    // 延迟重新设置翻页按钮，确保所有模板都已完全加载
    setTimeout(function() {
        // Update activeContentElement reference here if it might have been set by templates after initial JS load
        if (!activeContentElement && window.activeContentElement) {
            activeContentElement = window.activeContentElement;
            console.log('Updated activeContentElement in setTimeout:', activeContentElement);
            // If it was null before and now set, apply font settings
            if(activeContentElement && !localStorage.getItem('readerSettings')) { // Apply only if no saved settings, to avoid overriding user's last session
                 applyCurrentSettingsToElement(activeContentElement);
                 console.log("Applied font settings in setTimeout as activeContentElement was just found.");
            } else if (activeContentElement && localStorage.getItem('readerSettings')) {
                // If settings were loaded but ACE was null, re-apply
                console.log("Re-applying font settings in setTimeout as activeContentElement is now available.");
                loadSettings(); // This will call applyCurrentSettingsToElement
            }
        }
        console.log('Final DOM elements check in setTimeout:');
        console.log('page-navigation:', document.getElementById('page-navigation'));
        console.log('page-up:', document.getElementById('page-up'));
        console.log('page-down:', document.getElementById('page-down'));
        console.log('Final activeContentElement in setTimeout:', activeContentElement);
        console.log('Final contentType in setTimeout:', contentType || window.contentType);

        setupPageNavigation();
        setupDragNavigation();
        console.log('Page navigation and drag functionality re-initialized in setTimeout');
    }, 100); // This timeout might be critical for when activeContentElement is set by HTML templates
});

function throttle(func, limit) { /* ... existing throttle ... */
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}
