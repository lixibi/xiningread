// 阅读器交互功能 - 针对墨水屏优化

document.addEventListener('DOMContentLoaded', function() {
    const readingArea = document.getElementById('reading-area');
    const fileContent = document.querySelector('.file-content') || document.querySelector('.markdown-content');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const readerContainer = document.getElementById('reader-container');

    // 字体大小控制
    let currentFontSize = 18;
    const fontSmallerBtn = document.getElementById('font-smaller');
    const fontLargerBtn = document.getElementById('font-larger');

    // 浏览器全屏控制
    const fullscreenBtn = document.getElementById('fullscreen-browser');



    // 书签控制
    const bookmarkBtn = document.getElementById('bookmark-btn');
    const bookmarkSaveBtn = document.getElementById('bookmark-save');
    const currentFilePath = window.location.search;

    // 翻页控制
    const pageUpBtn = document.getElementById('page-up');
    const pageDownBtn = document.getElementById('page-down');
    const pageNavigation = document.getElementById('page-navigation');

    // 工具栏控制
    const controlToggle = document.getElementById('control-toggle');
    const controlButtons = document.getElementById('control-buttons');
    const readerControls = document.getElementById('reader-controls');
    let isControlsCollapsed = false;
    
    // 字体大小调整
    fontSmallerBtn.addEventListener('click', function() {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            fileContent.style.fontSize = currentFontSize + 'px';
            saveSettings();
        }
    });
    
    fontLargerBtn.addEventListener('click', function() {
        if (currentFontSize < 32) {
            currentFontSize += 2;
            fileContent.style.fontSize = currentFontSize + 'px';
            saveSettings();
        }
    });


    
    // 浏览器全屏切换
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', function() {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });

        // 监听全屏状态变化
        document.addEventListener('fullscreenchange', function() {
            if (document.fullscreenElement) {
                fullscreenBtn.textContent = '🔲 退出全屏';
            } else {
                fullscreenBtn.textContent = '🔳 浏览器全屏';
            }
        });
    }

    // 工具栏收起/展开
    controlToggle.addEventListener('click', function() {
        isControlsCollapsed = !isControlsCollapsed;
        if (isControlsCollapsed) {
            readerControls.classList.add('collapsed');
            controlToggle.textContent = '⚙️ 展开设置';
        } else {
            readerControls.classList.remove('collapsed');
            controlToggle.textContent = '⚙️ 收起设置';
        }
        saveSettings();
    });

    // 翻页功能
    const pageHeight = window.innerHeight * 0.8; // 每次翻页80%屏幕高度

    pageUpBtn.addEventListener('click', function() {
        window.scrollBy({
            top: -pageHeight,
            behavior: 'auto' // 墨水屏不使用smooth滚动
        });
    });

    pageDownBtn.addEventListener('click', function() {
        window.scrollBy({
            top: pageHeight,
            behavior: 'auto' // 墨水屏不使用smooth滚动
        });
    });

    // 翻页按钮拖动功能
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    pageNavigation.addEventListener('mousedown', function(e) {
        // 只有点击翻页按钮容器本身才开始拖动，点击按钮不拖动
        if (e.target === pageNavigation) {
            isDragging = true;
            const rect = pageNavigation.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            e.preventDefault();
        }
    });

    // 防止翻页按钮点击时触发拖动
    pageUpBtn.addEventListener('mousedown', function(e) {
        e.stopPropagation();
    });

    pageDownBtn.addEventListener('mousedown', function(e) {
        e.stopPropagation();
    });

    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            // 限制在屏幕范围内
            const maxX = window.innerWidth - pageNavigation.offsetWidth;
            const maxY = window.innerHeight - pageNavigation.offsetHeight;

            pageNavigation.style.right = 'auto';
            pageNavigation.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            pageNavigation.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            pageNavigation.style.transform = 'none';
        }
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
    });

    // 书签功能
    function getBookmarkKey() {
        return 'bookmark_' + btoa(currentFilePath);
    }

    function getCurrentProgress() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        return scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    }

    function saveBookmark() {
        const progress = getCurrentProgress();
        localStorage.setItem(getBookmarkKey(), progress.toFixed(2));
        alert(`书签已保存！当前位置：${progress.toFixed(1)}%`);
    }

    function loadBookmark() {
        const saved = localStorage.getItem(getBookmarkKey());
        if (saved) {
            const progress = parseFloat(saved);
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPosition = (progress / 100) * scrollHeight;

            if (confirm(`发现书签位置：${progress}%，是否跳转？`)) {
                window.scrollTo(0, scrollPosition);
                return true;
            }
        }
        return false;
    }

    function hasBookmark() {
        return localStorage.getItem(getBookmarkKey()) !== null;
    }

    // 书签按钮事件
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', function() {
            if (hasBookmark()) {
                if (!loadBookmark()) {
                    // 用户选择不跳转，询问是否更新书签
                    if (confirm('是否更新书签到当前位置？')) {
                        saveBookmark();
                    }
                }
            } else {
                saveBookmark();
            }
        });
    }

    if (bookmarkSaveBtn) {
        bookmarkSaveBtn.addEventListener('click', function() {
            saveBookmark();
        });
    }
    
    // 滚动进度跟踪
    function updateProgress() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        
        progressFill.style.width = progress + '%';
        progressText.textContent = Math.round(progress) + '%';
    }
    
    // 监听滚动事件（节流处理）
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(updateProgress, 100);
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
        switch(e.key) {
            case 'ArrowUp':
                if (e.ctrlKey) {
                    e.preventDefault();
                    fontLargerBtn.click();
                } else {
                    e.preventDefault();
                    pageUpBtn.click();
                }
                break;
            case 'ArrowDown':
                if (e.ctrlKey) {
                    e.preventDefault();
                    fontSmallerBtn.click();
                } else {
                    e.preventDefault();
                    pageDownBtn.click();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                pageUpBtn.click();
                break;
            case 'ArrowRight':
                e.preventDefault();
                pageDownBtn.click();
                break;
            case 'PageUp':
                e.preventDefault();
                pageUpBtn.click();
                break;
            case 'PageDown':
                e.preventDefault();
                pageDownBtn.click();
                break;
            case 'f':
                if (e.ctrlKey && fullscreenBtn) {
                    e.preventDefault();
                    fullscreenBtn.click();
                }
                break;
            case 'Home':
                window.scrollTo(0, 0);
                break;
            case 'End':
                window.scrollTo(0, document.body.scrollHeight);
                break;
        }
    });
    
    // 保存用户设置到localStorage
    function saveSettings() {
        const settings = {
            fontSize: currentFontSize,
            controlsCollapsed: isControlsCollapsed
        };
        localStorage.setItem('readerSettings', JSON.stringify(settings));
    }
    
    // 加载用户设置
    function loadSettings() {
        const saved = localStorage.getItem('readerSettings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);

                if (settings.fontSize) {
                    currentFontSize = settings.fontSize;
                    if (fileContent) {
                        fileContent.style.fontSize = currentFontSize + 'px';
                    }
                }

                if (settings.controlsCollapsed !== undefined) {
                    isControlsCollapsed = settings.controlsCollapsed;
                    if (isControlsCollapsed) {
                        readerControls.classList.add('collapsed');
                        controlToggle.textContent = '⚙️ 展开设置';
                    }
                }


            } catch (e) {
                console.log('设置加载失败:', e);
            }
        }
    }
    
    // 自动保存阅读位置
    function saveReadingPosition() {
        const scrollPosition = window.pageYOffset;
        const url = window.location.href;
        localStorage.setItem('readingPosition_' + btoa(url), scrollPosition);
    }
    
    // 恢复阅读位置
    function restoreReadingPosition() {
        const url = window.location.href;
        const saved = localStorage.getItem('readingPosition_' + btoa(url));
        if (saved) {
            setTimeout(() => {
                window.scrollTo(0, parseInt(saved));
            }, 100);
        }
    }
    
    // 页面卸载时保存位置
    window.addEventListener('beforeunload', saveReadingPosition);
    
    // 初始化
    loadSettings();

    // 检查书签（优先级高于阅读位置）
    setTimeout(() => {
        if (hasBookmark()) {
            loadBookmark();
        } else {
            restoreReadingPosition();
        }
        updateProgress();
    }, 100);
    
    // 添加快捷键提示
    const helpText = document.createElement('div');
    helpText.innerHTML = `
        <div style="position: fixed; bottom: 10px; right: 10px; background: #fff; border: 2px solid #000; padding: 10px; font-size: 12px; display: none; z-index: 10001;" id="help-panel">
            <strong>快捷键:</strong><br>
            Ctrl+↑/↓: 调整字体<br>
            Ctrl+F: 浏览器全屏<br>
            ↑/↓/←/→: 翻页<br>
            PageUp/PageDown: 翻页<br>
            Home/End: 跳转首尾<br>
            F1: 显示/隐藏帮助<br><br>
            <strong>操作:</strong><br>
            翻页按钮可拖动<br>
            工具栏可收起<br>
            🔖书签: 保存/跳转位置<br>
            💾: 快速保存书签
        </div>
    `;
    document.body.appendChild(helpText);
    
    // 显示/隐藏帮助
    let helpVisible = false;
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F1' || (e.key === '?' && e.shiftKey)) {
            e.preventDefault();
            const helpPanel = document.getElementById('help-panel');
            helpVisible = !helpVisible;
            helpPanel.style.display = helpVisible ? 'block' : 'none';
        }
    });
});
