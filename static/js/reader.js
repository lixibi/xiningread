// 阅读器交互功能 - 针对墨水屏优化

function initializeReaderFeatures() {
    console.log("[Reader] SUCCESS: window.activeContentElement and window.contentType are set. Initializing reader features...");
    console.log("[Reader] window.activeContentElement:", window.activeContentElement);
    console.log("[Reader] window.contentType:", window.contentType);

    // Assign local activeContentElement and contentType from window properties
    let activeContentElement = window.activeContentElement;
    let contentType = window.contentType;

    // Keep original DOM element references if they are only needed within this scope
    // and not by the polling mechanism itself.
    const readingArea = document.getElementById('reading-area');
    // contentContainer is often the same as activeContentElement for non-EPUBs, or a parent for EPUBs.
    // Let's ensure it's defined based on what activeContentElement is.
    // If activeContentElement is 'epub-content', contentContainer might be its parent or not directly used.
    // If activeContentElement is 'content-container', then they are the same.
    const contentContainer = document.getElementById('content-container') || activeContentElement;
    const fullContentDataSource = document.getElementById('full-content-data');
    // const staticFileContent = document.querySelector('.code-block code') || document.querySelector('pre.file-content'); // This was part of the original ACE fallback

    console.log("[Reader] Effective activeContentElement for initialization:", activeContentElement);
    console.log("[Reader] Effective contentType for initialization:", contentType);

    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    let currentFontSize = 18; // Default font size
    const fontSmallerBtn = document.getElementById('font-smaller');
    const fontLargerBtn = document.getElementById('font-larger');
    const fullscreenBtn = document.getElementById('fullscreen-browser');
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const bookmarkSaveBtn = document.getElementById('bookmark-save');
    // pageUpBtn and pageDownBtn are obtained within setupPageNavigation
    // const pageNavigation = document.getElementById('page-navigation'); // Obtained within setupDragNavigation
    const controlToggle = document.getElementById('control-toggle');
    const readerControls = document.getElementById('reader-controls');
    let isControlsCollapsed = false;
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentDocumentFilePath = urlParams.get('path');
    if (currentDocumentFilePath && typeof annotationsManager !== 'undefined') {
        annotationsManager.setCurrentFile(currentDocumentFilePath);
    } else if (currentDocumentFilePath) {
        console.warn("[Reader] annotationsManager is undefined, cannot set current file for annotations.");
    }

    // --- Content Chunking Logic ---
    let fullContent = '';
    let chunks = [];
    let currentChunkToRender = 0;
    const LINES_PER_CHUNK_TXT = 50;
    const CHARS_PER_CHUNK_MD = 8000;
    const INITIAL_CHUNKS_TO_LOAD = 2;
    const SCROLL_THRESHOLD = 400; // Pixels from bottom to trigger next chunk load

    // Ensure contentContainer is valid for chunking; it should be the element where chunks are appended.
    // For EPUB, activeContentElement is 'epub-content', chunking is not used.
    // For TXT/MD, activeContentElement is 'content-container', which is also our contentContainer.
    if (fullContentDataSource && contentContainer && (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain')) {
        fullContent = fullContentDataSource.textContent.trim();
    }
    
    function chunkContent() {
        if (!fullContent) return;
        chunks = [];
        if (contentType === 'txt' || contentType === 'plain') {
            const lines = fullContent.split('\n');
            for (let i = 0; i < lines.length; i += LINES_PER_CHUNK_TXT) {
                chunks.push(lines.slice(i, i + LINES_PER_CHUNK_TXT).join('\n'));
            }
        } else if (contentType === 'markdown') {
            // Markdown chunking (simplified)
            for (let i = 0; i < fullContent.length; i += CHARS_PER_CHUNK_MD) {
                let end = i + CHARS_PER_CHUNK_MD;
                // Try to not cut in the middle of a tag or word if possible (very simplified)
                if (end < fullContent.length) {
                    let potentialEnd = fullContent.lastIndexOf('>', end); // Prefer ending after a tag
                    if (potentialEnd > i) end = potentialEnd + 1;
                    else {
                        potentialEnd = fullContent.lastIndexOf(' ', end); // Or after a space
                        if (potentialEnd > i) end = potentialEnd + 1;
                    }
                }
                chunks.push(fullContent.substring(i, Math.min(end, fullContent.length)));
            }
        }
        console.log(`[Reader] Content chunked into ${chunks.length} chunks for contentType: ${contentType}`);
    }

    function renderNextChunk() {
        if (currentChunkToRender >= chunks.length || !contentContainer) {
            window.removeEventListener('scroll', throttledScrollHandler);
            console.log("[Reader] All chunks rendered or contentContainer missing. Removing scroll listener.");
            applyAnnotationsToRenderedContent();
            return false;
        }
        const chunkHTML = chunks[currentChunkToRender];
        if (contentType === 'txt' || contentType === 'plain') {
            const pre = document.createElement('pre');
            pre.textContent = chunkHTML;
            contentContainer.appendChild(pre);
        } else if (contentType === 'markdown') {
            // Assuming chunkHTML is safe HTML string from Python-Markdown
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = chunkHTML; // This part needs to be safe if content isn't pre-sanitized
            while(tempDiv.firstChild){ contentContainer.appendChild(tempDiv.firstChild); }
        }
        currentChunkToRender++;
        // Apply font settings to the container; new chunks should inherit or be covered by general styling
        if (activeContentElement) applyCurrentSettingsToElement(activeContentElement); // Apply to the main readable area
        else if (contentContainer) applyCurrentSettingsToElement(contentContainer);


        console.log(`[Reader] Chunk ${currentChunkToRender-1} rendered. Applied font size ${currentFontSize}px.`);
        if (contentContainer && contentContainer.style) {
            console.log(`[Reader] contentContainer current inline font-size: ${contentContainer.style.fontSize}`);
        }
        updateProgress();
        return true;
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
        // ... (rest of createSelectionToolbar as before)
        selectionToolbar.style.position = 'absolute';
        selectionToolbar.style.zIndex = '10000';
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

    // Ensure readingArea is defined before attaching listener
    if (readingArea) {
        readingArea.addEventListener('mouseup', function(e) {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                    currentSelectionRange = selection.getRangeAt(0);
                    // Ensure contentContainer is valid for checking contains
                    const validContainer = (contentType === 'epub' && window.activeContentElement) ? window.activeContentElement : contentContainer;
                    if (validContainer && validContainer.contains(currentSelectionRange.commonAncestorContainer)) {
                        if (currentSelectionRange.startContainer.nodeType === Node.ELEMENT_NODE && currentSelectionRange.startContainer.classList.contains('highlighted-text')) {
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

    document.addEventListener('mousedown', function(e) {
        if (selectionToolbar && selectionToolbar.style.display === 'flex' && !selectionToolbar.contains(e.target)) {
            const selection = window.getSelection();
            const validReadingArea = readingArea || activeContentElement; // Use activeContentElement if readingArea is not defined
            if (selection.isCollapsed || (validReadingArea && !validReadingArea.contains(selection.anchorNode))) {
                 hideSelectionToolbar();
            }
        }
    });

    function getTXTSelectionRangeData(range) {
        // Ensure contentContainer is valid
        const validContainer = (contentType === 'epub' && window.activeContentElement) ? window.activeContentElement : contentContainer;
        if (!validContainer || !fullContent) return null;

        let tempRange = document.createRange();
        tempRange.selectNodeContents(validContainer);
        tempRange.setEnd(range.startContainer, range.startOffset);
        const textBeforeSelection = tempRange.toString();
        const startOffset = textBeforeSelection.length;

        const selectedText = range.toString();
        const endOffset = startOffset + selectedText.length;

        return { type: 'txt-char-offset', startOffset, endOffset, selectedText };
    }

    function getPathTo(node) {
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
        const selectedText = range.toString().trim();
        if (!selectedText) return null;
        let startNode = range.startContainer;
        let endNode = range.endContainer;
        const startNodePath = getPathTo(startNode);
        const endNodePath = getPathTo(endNode);
        return {
            type: 'md-html',
            startNodePath: startNodePath, startOffset: range.startOffset,
            endNodePath: endNodePath, endOffset: range.endOffset,
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
            span.classList.add('annotated-text');
        }
        try {
            if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
                 range.surroundContents(span);
            } else {
                const fragment = range.extractContents();
                span.appendChild(fragment);
                range.insertNode(span);
            }
        } catch (e) { console.error("Error applying highlight:", e); }
    }

    function handleAnnotation(type) {
        if (!currentSelectionRange) return;
        let rangeData;
        if (contentType === 'txt' || contentType === 'plain') {
            rangeData = getTXTSelectionRangeData(currentSelectionRange);
        } else if (contentType === 'markdown') {
            rangeData = getMDSelectionRangeData(currentSelectionRange);
        } else if (contentType === 'epub') { // EPUB might use TXT-like selection or need its own
            rangeData = getTXTSelectionRangeData(currentSelectionRange); // Assuming EPUB text selection is similar to TXT for now
        } else {
            console.warn("Annotation not supported for this content type:", contentType);
            hideSelectionToolbar(); return;
        }
        if (!rangeData) {
            console.warn("Could not generate range data.");
            hideSelectionToolbar(); return;
        }
        let comment = "";
        if (type === 'note') {
            comment = prompt("输入您的备注:", "");
            if (comment === null) { hideSelectionToolbar(); window.getSelection().removeAllRanges(); return; }
        }
        const note = {
            type: type, text: rangeData.selectedText || currentSelectionRange.toString(),
            comment: comment, color: (type === 'note' ? 'lightblue' : 'yellow'),
            rangeData: rangeData, timestamp: new Date().toISOString()
        };
        if (typeof annotationsManager !== 'undefined') {
            const savedNote = annotationsManager.addNote(note);
            if (savedNote) applyHighlight(currentSelectionRange, savedNote.id, savedNote.color, savedNote.type);
        } else {
            console.warn("[Reader] annotationsManager not available. Cannot save annotation.");
        }
        hideSelectionToolbar();
        if (window.getSelection) window.getSelection().removeAllRanges();
    }

    function restoreTXTAnnotation(note) {
        const validContainer = (contentType === 'epub' && window.activeContentElement) ? window.activeContentElement : contentContainer;
        if (!validContainer || (contentType !== 'epub' && !fullContent) || note.rangeData.type !== 'txt-char-offset') return;

        const { startOffset, endOffset } = note.rangeData;
        function findNodeAndOffset(targetGlobalOffset) {
            let currentGlobalOffset = 0;
            // For EPUB, validContainer is #epub-content. For TXT, it's #content-container containing <pre>
            const elementsToSearch = (contentType === 'epub') ? [validContainer] : Array.from(validContainer.querySelectorAll('pre'));

            if (elementsToSearch.length === 0 && validContainer.firstChild && validContainer.firstChild.nodeType === Node.TEXT_NODE && contentType !== 'epub') {
                 if (targetGlobalOffset <= validContainer.firstChild.textContent.length) {
                    return { node: validContainer.firstChild, offset: targetGlobalOffset };
                }
                return null;
            }

            for (const elem of elementsToSearch) {
                const walker = document.createTreeWalker(elem, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    const nodeLength = node.textContent.length;
                    if (targetGlobalOffset >= currentGlobalOffset && targetGlobalOffset <= currentGlobalOffset + nodeLength) {
                        return { node: node, offset: targetGlobalOffset - currentGlobalOffset };
                    }
                    currentGlobalOffset += nodeLength;
                }
            }
            return null;
        }
        const startPos = findNodeAndOffset(startOffset);
        const endPos = findNodeAndOffset(endOffset);
        if (startPos && endPos) {
            try {
                const range = document.createRange();
                range.setStart(startPos.node, startPos.offset);
                range.setEnd(endPos.node, endPos.offset);
                applyHighlight(range, note.id, note.color, note.type);
            } catch (e) { console.error("Error restoring TXT/EPUB annotation range:", e, note); }
        } else { console.warn("Could not find nodes for TXT/EPUB annotation:", note); }
    }
    
    function restoreMDAnnotation(note) {
        // This function remains complex and potentially fragile as noted before.
        // Ensure contentContainer is valid for MD
        if (!contentContainer || note.rangeData.type !== 'md-html') return;
        const { selectedText, startNodePath, startOffset, endNodePath, endOffset } = note.rangeData;
        // ... (getNodeByPath and the rest of restoreMDAnnotation logic remains the same)
        // For brevity, not repeating the whole function here, assume it's moved.
        // IMPORTANT: Ensure getNodeByPath is also moved into initializeReaderFeatures or made accessible.
        function getNodeByPath(pathStr) { /* ... as before ... */
            try {
                if (pathStr.startsWith('id("')) {
                    const id = pathStr.match(/id\("([^"]+)"\)/)[1];
                    return document.getElementById(id);
                }
                let current = document; // Simplified, might need to be contentContainer
                const parts = pathStr.split('/');
                for(const part of parts){
                    if(!current) return null;
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
                if ( (startContainer.nodeType === Node.TEXT_NODE || startContainer.childNodes.length >= startOffset) && //childNodes.length should be > offset
                     (endContainer.nodeType === Node.TEXT_NODE || endContainer.childNodes.length >= endOffset) ) { //childNodes.length should be > offset
                    const startNodeLength = startContainer.nodeValue ? startContainer.nodeValue.length : (startContainer.childNodes ? startContainer.childNodes.length : 0);
                    const endNodeLength = endContainer.nodeValue ? endContainer.nodeValue.length : (endContainer.childNodes ? endContainer.childNodes.length : 0);

                    if (startOffset <= startNodeLength && endOffset <= endNodeLength) {
                        range.setStart(startContainer, startOffset);
                        range.setEnd(endContainer, endOffset);
                        if (range.toString().trim() === selectedText) {
                            applyHighlight(range, note.id, note.color, note.type);
                        } else { console.warn("MD annotation text mismatch:", note.selectedText, "vs", range.toString()); }
                    } else { console.warn("MD annotation offset out of bounds:", note); }
                } else { console.warn("MD annotation node type or child count issue:", note); }
            } catch (e) { console.error("Error restoring MD annotation range:", e, note); }
        } else { console.warn("Could not find nodes for MD annotation or invalid offsets:", note); }
    }

    function applyAnnotationsToRenderedContent() {
        if (!currentDocumentFilePath) return;
        if (typeof annotationsManager === 'undefined') {
            console.warn('[Reader] annotationsManager not available, skipping annotations');
            return;
        }
        // Use the globally confirmed activeContentElement for annotations target
        const targetContainerForAnnotations = window.activeContentElement;
        if (!targetContainerForAnnotations) {
            console.warn('[Reader] No target container found for annotations (window.activeContentElement is null)');
            return;
        }
        try {
            targetContainerForAnnotations.querySelectorAll('.highlighted-text').forEach(span => {
                const parent = span.parentNode;
                while (span.firstChild) { parent.insertBefore(span.firstChild, span); }
                parent.removeChild(span);
                parent.normalize();
            });
        } catch (e) { console.error('[Reader] Error clearing existing highlights:', e); return; }
        try {
            const notes = annotationsManager.getNotesForCurrentFile();
            notes.forEach(note => {
                if (note.rangeData) {
                    if (note.rangeData.type === 'txt-char-offset') { // Handles TXT and EPUB (if EPUB uses this type)
                        restoreTXTAnnotation(note);
                    } else if (note.rangeData.type === 'md-html' && contentType === 'markdown') {
                        restoreMDAnnotation(note);
                    }
                }
            });
        } catch (e) { console.error('[Reader] Error applying annotations:', e); }
    }
    
    // --- End Annotation Logic ---

    // --- Core Functionalities (Font, Fullscreen, Bookmark, etc.) ---
    // Ensure `activeContentElement` used below is the one derived from `window.activeContentElement`

    function applyCurrentSettingsToElement(elementToStyle) { // Renamed parameter for clarity
        // `elementToStyle` should be `window.activeContentElement`
        console.log("[Reader] applyCurrentSettingsToElement called with:", elementToStyle, "Current font size:", currentFontSize, "Effective ContentType:", contentType);
        if (elementToStyle) {
            if (contentType === 'epub') {
                console.log(`[Reader] Applying font settings for EPUB. Target element:`, elementToStyle, `Font size: ${currentFontSize}px`);
            }
            elementToStyle.style.setProperty('font-size', currentFontSize + 'px', 'important');
            // console.log(`[Reader] Applied font-size ${currentFontSize}px to element:`, elementToStyle); // Slightly redundant with the EPUB log, can be kept for non-EPUB
            if (elementToStyle.style.fontSize) {
                // console.log(`[Reader] Element's inline font-size after setProperty: ${elementToStyle.style.fontSize}`);
            } else {
                // console.log(`[Reader] Element's inline font-size not set directly (check CSSStyleDeclaration).`);
            }
            // For EPUB, direct application to #epub-content (which is activeContentElement) is now the primary method.
        } else {
            console.warn("[Reader] applyCurrentSettingsToElement: elementToStyle is null or undefined.");
        }
    }
    window.applyCurrentSettingsToElement = applyCurrentSettingsToElement; // Expose globally if needed by other scripts (e.g. EPUB specific)

    function updateProgress() {
        let progress = 0;
        if (chunks.length > 0 && (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain')) {
             progress = (currentChunkToRender / chunks.length) * 100;
             if (currentChunkToRender === chunks.length && chunks.length > 0) progress = 100;
        } else { // For non-chunked (EPUB, Code) or fully loaded chunked
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : (document.body.scrollHeight > 0 ? 100 : 0) ;
        }
        if (progressFill) progressFill.style.width = `${progress}%`;
        if (progressText) progressText.textContent = `${Math.round(progress)}%`;
    }
    window.updateProgress = updateProgress; // Expose globally

    if (fontSmallerBtn && fontLargerBtn) {
        fontSmallerBtn.addEventListener('click', () => {
            console.log("[Reader] Font-smaller clicked. ACE:", activeContentElement, " CFS:", currentFontSize);
            if (!activeContentElement) { console.error("Cannot change font: activeContentElement is null."); return; }
            if (currentFontSize > 12) {
                currentFontSize -= 2;
                applyCurrentSettingsToElement(activeContentElement);
                saveSettings();
            }
        });
        fontLargerBtn.addEventListener('click', () => {
            console.log("[Reader] Font-larger clicked. ACE:", activeContentElement, " CFS:", currentFontSize);
            if (!activeContentElement) { console.error("Cannot change font: activeContentElement is null."); return; }
            if (currentFontSize < 32) {
                currentFontSize += 2;
                applyCurrentSettingsToElement(activeContentElement);
                saveSettings();
            }
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function() {
            if (document.fullscreenElement) { document.exitFullscreen(); }
            else { document.documentElement.requestFullscreen(); }
        });
        document.addEventListener('fullscreenchange', function() {
            console.log('[Reader] Fullscreen state changed. Is fullscreen:', !!document.fullscreenElement);
            fullscreenBtn.textContent = document.fullscreenElement ? '🔲 退出全屏' : '🔳 浏览器全屏';
            if (document.fullscreenElement) { document.body.classList.add('fullscreen-mode'); }
            else { document.body.classList.remove('fullscreen-mode'); }
        });
    }

    if (controlToggle && readerControls) {
        controlToggle.addEventListener('click', function() {
            isControlsCollapsed = !isControlsCollapsed;
            readerControls.classList.toggle('collapsed', isControlsCollapsed);
            controlToggle.textContent = isControlsCollapsed ? '⚙️ 展开设置' : '⚙️ 收起设置';
            saveSettings(); // Save collapsed state
        });
    }

    // Page Navigation (Buttons)
    function setupPageNavigation() {
        const pageUpButton = document.getElementById('page-up'); // Renamed for clarity
        const pageDownButton = document.getElementById('page-down'); // Renamed for clarity
        console.log('[Reader] Setting up page navigation. pageUpBtn:', pageUpButton, 'pageDownBtn:', pageDownButton);
        if (pageUpButton) {
            pageUpButton.removeEventListener('click', pageUpHandler); // Avoid double-binding
            pageUpButton.addEventListener('click', pageUpHandler);
            console.log('[Reader] Page up button event listener added.');
        } else { console.warn('[Reader] Page up button not found!'); }
        if (pageDownButton) {
            pageDownButton.removeEventListener('click', pageDownHandler); // Avoid double-binding
            pageDownButton.addEventListener('click', pageDownHandler);
            console.log('[Reader] Page down button event listener added.');
        } else { console.warn('[Reader] Page down button not found!'); }
    }

    function pageUpHandler(e) {
        e.preventDefault(); console.log('[Reader] Page up clicked');
        window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' });
    }
    function pageDownHandler(e) {
        e.preventDefault(); console.log('[Reader] Page down clicked');
        window.scrollBy({ top: (window.innerHeight * 0.8), behavior: 'smooth' });
    }

    // Draggable Page Navigation
    function setupDragNavigation() {
        const pageNavElement = document.getElementById('page-navigation'); // Renamed for clarity
        if (pageNavElement) {
            // ... (setupDragNavigation logic remains largely the same, ensure it uses pageNavElement)
            // For brevity, not repeating the whole function here, assume it's moved.
            // Ensure button variables inside are correctly scoped or re-fetched if necessary.
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };
            pageNavElement.addEventListener('mousedown', function(e) {
                if (e.target === pageNavElement) {
                    isDragging = true;
                    const rect = pageNavElement.getBoundingClientRect();
                    dragOffset.x = e.clientX - rect.left;
                    dragOffset.y = e.clientY - rect.top;
                    e.preventDefault(); // Prevent text selection while dragging
                }
            });
            const pageUpButtonInDrag = document.getElementById('page-up'); // Re-fetch for this scope
            const pageDownButtonInDrag = document.getElementById('page-down'); // Re-fetch
            const bookmarkSaveButtonInDrag = document.getElementById('bookmark-save'); // Re-fetch

            [pageUpButtonInDrag, pageDownButtonInDrag, bookmarkSaveButtonInDrag].forEach(btn => {
                if (btn) btn.addEventListener('mousedown', e => e.stopPropagation());
            });
            document.addEventListener('mousemove', function(e) {
                if (isDragging) {
                    let x = e.clientX - dragOffset.x;
                    let y = e.clientY - dragOffset.y;
                    const maxX = window.innerWidth - pageNavElement.offsetWidth;
                    const maxY = window.innerHeight - pageNavElement.offsetHeight;
                    pageNavElement.style.right = 'auto'; // Clear right if previously set
                    pageNavElement.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
                    pageNavElement.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
                    pageNavElement.style.transform = 'none'; // Clear transform if previously centered
                }
            });
            document.addEventListener('mouseup', function() { isDragging = false; });
        }
    }

    // Bookmarks
    function getBookmarkKey() { return 'bookmark_' + btoa(window.location.href); }
    function getCurrentScrollProgress() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    }
    function saveBookmark() {
        const key = getBookmarkKey();
        const bookmarkData = {
            scrollPosition: window.pageYOffset, progress: getCurrentScrollProgress(),
            timestamp: new Date().toISOString(), url: window.location.href, fontSize: currentFontSize
        };
        console.log(`[Reader][saveBookmark] Saving for key "${key}":`, bookmarkData);
        try {
            localStorage.setItem(key, JSON.stringify(bookmarkData));
            console.log(`[Reader][saveBookmark] Success for key "${key}".`);
            if (bookmarkBtn) { /* UI feedback */
                bookmarkBtn.textContent = '🔖 已保存书签'; bookmarkBtn.style.backgroundColor = '#4CAF50';
                setTimeout(() => { bookmarkBtn.textContent = '🔖 书签'; bookmarkBtn.style.backgroundColor = ''; }, 2000);
            }
        } catch (e) { console.error(`[Reader][saveBookmark] Error for key "${key}":`, e); }
    }
    function loadBookmark() {
        const key = getBookmarkKey();
        const saved = localStorage.getItem(key);
        console.log(`[Reader][loadBookmark] Attempting for key "${key}". Found:`, !!saved);
        if (saved) {
            try {
                const bookmarkData = JSON.parse(saved);
                console.log('[Reader][loadBookmark] Parsed data:', bookmarkData);
                console.log(`[Reader][loadBookmark] ACE before timeout:`, activeContentElement, `ScrollHeight: ${document.documentElement.scrollHeight}`);
                setTimeout(() => {
                    console.log(`[Reader][loadBookmark internal] Timeout. Scroll: ${bookmarkData.scrollPosition}, Font: ${bookmarkData.fontSize}`);
                    console.log(`[Reader][loadBookmark internal] ACE in timeout:`, activeContentElement, `ScrollHeight: ${document.documentElement.scrollHeight}`);
                    window.scrollTo(0, bookmarkData.scrollPosition);
                    console.log(`[Reader][loadBookmark internal] Scrolled to: ${window.pageYOffset}`);
                    if (bookmarkData.fontSize && currentFontSize !== bookmarkData.fontSize) {
                        console.log(`[Reader][loadBookmark internal] Restoring font: ${bookmarkData.fontSize}`);
                        currentFontSize = bookmarkData.fontSize;
                        if (activeContentElement) applyCurrentSettingsToElement(activeContentElement);
                        else console.warn('[Reader][loadBookmark internal] ACE null, cannot apply font.');
                        saveSettings();
                    }
                }, 250);
                return true;
            } catch (e) { console.error(`[Reader][loadBookmark] Error for key "${key}":`, e); return false; }
        }
        return false;
    }
    function hasBookmark() {
        const key = getBookmarkKey();
        const has = localStorage.getItem(key) !== null;
        console.log(`[Reader][hasBookmark] Key "${key}". Found: ${has}`);
        return has;
    }
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', function() {
            if (hasBookmark()) { if (!loadBookmark() && confirm('是否更新书签到当前位置？')) saveBookmark(); }
            else { saveBookmark(); }
        });
    }
    if (bookmarkSaveBtn) bookmarkSaveBtn.addEventListener('click', saveBookmark);

    // Scroll Handling & Throttling
    function handleScroll() {
        updateProgress();
        if (chunks.length > currentChunkToRender && (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain')) {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD) renderNextChunk();
        }
    }
    const throttledScrollHandler = throttle(handleScroll, 100); // throttle is defined below
    window.addEventListener('scroll', throttledScrollHandler);

    // Keyboard Shortcuts
    let helpVisible = false; // Moved helpVisible here to be within scope
    document.addEventListener('keydown', function(e) {
        // Target for inputs, textareas, contenteditables should not trigger shortcuts
        if (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); if(fontLargerBtn) fontLargerBtn.click(); }
        else if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); if(fontSmallerBtn) fontSmallerBtn.click(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); console.log('[Reader] Keyboard page up'); window.scrollBy({ top: -(window.innerHeight * 0.8), behavior: 'smooth' }); }
        else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); console.log('[Reader] Keyboard page down'); window.scrollBy({ top: (window.innerHeight * 0.8), behavior: 'smooth' }); }
        else if (e.key === 'Home') { e.preventDefault(); window.scrollTo(0, 0); }
        else if (e.key === 'End') { e.preventDefault(); window.scrollTo(0, document.body.scrollHeight); }
        else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); if(fullscreenBtn) fullscreenBtn.click(); }
        if (e.key === 'F1' || (e.key === '?' && e.shiftKey)) {
            e.preventDefault();
            helpVisible = !helpVisible;
            const helpPanel = document.getElementById('help-panel');
            if (helpPanel) helpPanel.style.display = helpVisible ? 'block' : 'none';
        }
    });

    // Settings Persistence
    function saveSettings() {
        localStorage.setItem('readerSettings', JSON.stringify({ fontSize: currentFontSize, controlsCollapsed: isControlsCollapsed }));
        console.log("[Reader] Settings saved:", { fontSize: currentFontSize, controlsCollapsed: isControlsCollapsed });
    }
    function loadSettings() {
        const saved = localStorage.getItem('readerSettings');
        console.log("[Reader] loadSettings called. ACE:", activeContentElement, "CT:", contentType);
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                currentFontSize = settings.fontSize || 18;
                isControlsCollapsed = settings.controlsCollapsed || false; // Load collapsed state
                console.log("[Reader] Loaded settings:", settings);
                if (activeContentElement) applyCurrentSettingsToElement(activeContentElement);
                else console.warn("[Reader] loadSettings: ACE null, cannot apply font yet.");
                // Apply controls collapsed state
                if (readerControls && controlToggle) {
                    readerControls.classList.toggle('collapsed', isControlsCollapsed);
                    controlToggle.textContent = isControlsCollapsed ? '⚙️ 展开设置' : '⚙️ 收起设置';
                }
            } catch (e) { console.error('[Reader] Error loading settings:', e); }
        } else {
            console.log("[Reader] No saved settings, applying default font.");
            if (activeContentElement) applyCurrentSettingsToElement(activeContentElement); // Apply default
            else console.warn("[Reader] loadSettings: ACE null, cannot apply default font yet.");
        }
    }
    function saveReadingPosition() { localStorage.setItem('readingPosition_' + btoa(window.location.href), window.pageYOffset); }
    function restoreReadingPosition() {
        const savedPos = localStorage.getItem('readingPosition_' + btoa(window.location.href));
        if (savedPos) setTimeout(() => window.scrollTo(0, parseInt(savedPos)), 150);
    }
    window.addEventListener('beforeunload', saveReadingPosition);

    // Initial Setup Calls
    loadSettings(); // Load settings first, which includes applying font size

    // Content Initialization (Chunking or Direct)
    if (contentType === 'txt' || contentType === 'markdown' || contentType === 'plain') {
        chunkContent(); // Prepare chunks
        if (contentContainer) contentContainer.innerHTML = ''; // Clear container for new chunks
        let loadedInitial = 0;
        for (let i = 0; i < INITIAL_CHUNKS_TO_LOAD && loadedInitial < chunks.length; i++) {
            if(renderNextChunk()) loadedInitial++;
        }
        if (chunks.length > loadedInitial) { // If more chunks remain
            // Scroll listener is already added globally, will call renderNextChunk
        } else { // All chunks loaded initially
            applyAnnotationsToRenderedContent();
            updateProgress(); // Update progress after all initial chunks are rendered
        }
    } else if (contentType === 'epub') {
        // EPUB content is already in #epub-content (activeContentElement)
        // Font settings are applied by loadSettings -> applyCurrentSettingsToElement
        // Annotations and progress are handled by the specific epub timeout further down.
    } else { // For 'code' or other direct content types not requiring chunking
        applyAnnotationsToRenderedContent();
        updateProgress();
    }

    // General Initialization Sequence (after content structure is somewhat ready)
    // For EPUB, a specific timeout handles this. For others, it's here.
    if (contentType !== 'epub') {
        setTimeout(() => {
            if (hasBookmark()) loadBookmark();
            else restoreReadingPosition();
            updateProgress(); // Initial progress update
            applyAnnotationsToRenderedContent(); // Apply annotations after potential scroll
        }, 200); // Delay to allow rendering and scroll position restoration
    } else { // EPUB specific timing from original code
         setTimeout(() => {
            if (hasBookmark()) loadBookmark(); else restoreReadingPosition();
            updateProgress(); applyAnnotationsToRenderedContent();
        }, 200); // This was 200 in original, ensure it's after activeContentElement is set
    }

    // Help Panel (ensure it's created)
    const helpPanelExists = document.getElementById('help-panel');
    if (!helpPanelExists) {
        const helpTextDiv = document.createElement('div');
        helpTextDiv.innerHTML = `<div style="position: fixed; bottom: 10px; right: 10px; background: #fff; border: 2px solid #000; padding: 10px; font-size: 12px; display: none; z-index: 10001;" id="help-panel"><strong>快捷键:</strong><br>Ctrl+↑/↓: 调整字体<br>Ctrl+F: 浏览器全屏<br>←/→/PageUp/PageDown: 翻页<br>Home/End: 跳转首尾<br>F1 or Shift+?: 显示/隐藏帮助<br><br><strong>操作:</strong><br>翻页按钮可拖动<br>工具栏可收起<br>🔖书签: 保存/跳转位置<br>💾: 快速保存书签</div>`;
        document.body.appendChild(helpTextDiv.firstChild); // Append the actual div, not the container
    }


    if (activeContentElement) { //This was already called by loadSettings if ACE was available
        // applyCurrentSettingsToElement(activeContentElement);
        console.log("[Reader] Font settings were applied via loadSettings if activeContentElement was present.");
    } else {
        console.warn("[Reader] activeContentElement is null at end of init. Font size might not be correctly applied if not set by template scripts earlier.");
    }

    createSelectionToolbar(); // Ensure toolbar is ready

    // Final setup for navigation, potentially after all content (including EPUB specific) is more settled
    // This replaces the old final setTimeout
    setTimeout(function() {
        console.log('[Reader] Final DOM checks and re-init for navigation (100ms post-init).');
        // No need to re-check activeContentElement here as initializeReaderFeatures only runs if it's set.
        // But ensure it's the latest from window if it could have changed by other scripts (unlikely here)
        if (window.activeContentElement && activeContentElement !== window.activeContentElement) {
             console.warn("[Reader] window.activeContentElement changed post-initialization. This is unexpected.");
             activeContentElement = window.activeContentElement; // Re-align
             // Potentially re-apply settings if this happens, though it indicates a deeper issue.
             // loadSettings();
        }

        console.log('[Reader] Page Nav elements check: NavContainer:', document.getElementById('page-navigation'), 'Up:', document.getElementById('page-up'), 'Down:', document.getElementById('page-down'));
        console.log('[Reader] Final activeContentElement in setTimeout:', activeContentElement);
        console.log('[Reader] Final contentType in setTimeout:', contentType);

        setupPageNavigation(); // Re-run to ensure listeners are on correct, potentially dynamic elements
        setupDragNavigation(); // Same for drag functionality
        console.log('[Reader] Page navigation and drag re-initialized.');
    }, 100); // A small delay as before, for things to settle.
}


document.addEventListener('DOMContentLoaded', function() {
    console.log("[Reader] DOM fully loaded and parsed. Starting reader.js setup polling...");

    let pollInterval;
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 seconds

    function checkGlobalsAndInit() {
        attempts++;
        // console.log(`[Reader] Polling for global vars... Attempt ${attempts}`); // Can be too verbose
        if (window.activeContentElement && window.contentType) {
            console.log(`[Reader] Polling SUCCESS: Found window.activeContentElement and window.contentType after ${attempts} attempts.`);
            clearInterval(pollInterval);
            initializeReaderFeatures();
        } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            console.error("[Reader] ERROR: Timed out waiting for window.activeContentElement and window.contentType to be set by the template.");
            // Fallback: Try to initialize with whatever is available, or show error.
            // For now, we'll attempt to initialize, but it might fail if elements are missing.
            if (!window.activeContentElement) {
                 // Try to find a default content container as a last resort
                 window.activeContentElement = document.getElementById('content-container') || document.getElementById('epub-content') || document.body;
                 console.warn("[Reader] window.activeContentElement was not set by template, falling back to generic element:", window.activeContentElement);
            }
            if (!window.contentType) {
                // Try to infer content type, or default to 'plain'
                const contentEl = window.activeContentElement;
                if (contentEl && contentEl.id === 'epub-content') window.contentType = 'epub';
                else if (contentEl && contentEl.classList && contentEl.classList.contains('markdown-content')) window.contentType = 'markdown';
                else if (contentEl && contentEl.classList && contentEl.classList.contains('txt-content')) window.contentType = 'txt';
                else window.contentType = 'plain'; // Default fallback
                console.warn("[Reader] window.contentType was not set by template, falling back to:", window.contentType);
            }
            initializeReaderFeatures(); // Attempt to initialize even on timeout, with fallbacks.
        }
    }

    // Check immediately in case they are already set by a script loaded before this one in the template
    if (window.activeContentElement && window.contentType) {
        console.log("[Reader] Globals (window.activeContentElement & window.contentType) already set on DOMContentLoaded.");
        initializeReaderFeatures();
    } else {
        console.log("[Reader] Starting polling for window.activeContentElement and window.contentType.");
        pollInterval = setInterval(checkGlobalsAndInit, 100); // Poll every 100ms
    }
});

// throttle function should be outside DOMContentLoaded to be globally available if needed,
// or defined within initializeReaderFeatures if only used there.
// For now, keep it global as it was.
function throttle(func, limit) {
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
