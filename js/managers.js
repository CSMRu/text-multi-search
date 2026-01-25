/**
 * TMS Managers
 * Consolidated Main-Thread Logic for:
 * - WorkerManager (Background Processing)
 * - UIManager (Visuals)
 * - FileManager (I/O)
 * - HistoryManager (Undo/Redo)
 */

window.TMS = window.TMS || {};

// =============================================================================
// [1] Worker Manager
// =============================================================================
const WORKER_CONFIG = {
    TIMEOUT_MS: 3000
};

TMS.WorkerManager = {
    worker: null,
    timer: null,
    currentId: 0,
    isLoading: false,
    useFallback: false,

    init() {
        if (window.location.protocol === 'file:') {
            this.useFallback = true;
            TMS.UIManager.showToast('Running in local mode (No Worker).', 'info');
            console.warn('Worker disabled due to file:// protocol. Using FallbackEngine.');
            return;
        }
        try {
            if (this.worker) this.worker.terminate();
            this.worker = new Worker('js/worker.js');
            this.worker.onmessage = this.handleMessage.bind(this);
            this.worker.onerror = (e) => {
                console.error('Worker Error:', e);
                this.useFallback = true;
                this.finishState();
                TMS.UIManager.showToast('Worker failed. Switching to Sync mode.', 'error');
            };
        } catch (e) {
            this.useFallback = true;
            console.error('Worker Init Failed:', e);
            TMS.UIManager.showToast('Worker initialization failed. Switching to Sync mode.', 'error');
        }
    },

    scheduleProcessing() {
        const len = TMS.EL.sourceInput ? TMS.EL.sourceInput.value.length : 0;
        const delay = TMS.Utils.getSmartDebounceDelay(len);

        if (TMS.STATE.debounceTimer) clearTimeout(TMS.STATE.debounceTimer);
        TMS.STATE.debounceTimer = setTimeout(() => this.processText(), delay);
    },

    processText() {
        if (!TMS.STATE.isSynced) return;

        const sourceText = TMS.EL.sourceInput.value;
        const keywordsValue = TMS.EL.keywordsInput.value;

        if (!sourceText) {
            TMS.EL.outputDiv.innerHTML = '';
            TMS.EL.countMatch.textContent = '0';
            TMS.EL.countReplace.textContent = '0';
            TMS.UIManager.updateActionButtonsState();
            return;
        }

        this.postMessage(sourceText, keywordsValue);
    },

    stopRendering() {
        this.currentId++;
        this.finishState();
    },

    postMessage(sourceText, keywordsValue) {
        if (this.isLoading && this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        if (!this.worker && !this.useFallback) this.init();

        this.currentId++;
        this.setLoading(true);

        if (this.useFallback) {
            setTimeout(() => {
                try {
                    const result = TMS.Engine.processText(sourceText, keywordsValue);
                    this.handleMessage({ data: { id: this.currentId, status: 'success', ...result } });
                } catch (e) {
                    this.handleMessage({ data: { id: this.currentId, status: 'error', message: e.message } });
                }
            }, 10);
            return;
        }

        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.handleTimeout();
        }, WORKER_CONFIG.TIMEOUT_MS);

        this.worker.postMessage({
            id: this.currentId,
            sourceText,
            keywordsValue
        });
    },

    handleMessage(e) {
        const { id, status, html, matchCount, replaceCount, message } = e.data;
        if (id !== this.currentId) return;

        clearTimeout(this.timer);

        if (status === 'success') {
            TMS.EL.countMatch.textContent = matchCount;
            TMS.EL.countReplace.textContent = replaceCount;
            TMS.EL.outputDiv.innerHTML = html || '';
            this.setLoading(false);
            TMS.UIManager.updateActionButtonsState();
        } else {
            this.setLoading(false);
            TMS.UIManager.showToast(message || 'Unknown Error', 'error');
        }
    },



    handleTimeout() {
        this.worker.terminate();
        this.worker = null;
        this.setLoading(false);
        TMS.UIManager.showToast('Search Timed Out (Too complex)', 'error');
        TMS.EL.outputDiv.innerHTML += '<div class="timeout-warning">⚠️ Calculation Timed Out. Please simplify your keywords.</div>';
    },

    setLoading(active) {
        this.isLoading = active;
        const bar = TMS.EL.loadingBar;
        if (bar) {
            if (active) bar.classList.add('active');
            else bar.classList.remove('active');
        }
    },

    finishState() {
        clearTimeout(this.timer);
        this.setLoading(false);
    }
};

// =============================================================================
// [2] UI Manager
// =============================================================================
TMS.UIManager = {
    showToast(message, type = 'error') {
        const container = TMS.EL.toastContainer;
        if (!container) return;

        const icon = { error: 'alert-circle', success: 'check-circle', info: 'info' }[type] || 'alert-circle';
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon"><i data-lucide="${icon}"></i></span><span>${TMS.Utils.escapeHtml(message)}</span>`;

        container.appendChild(toast);
        TMS.Utils.refreshIcons();

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    updateButtonIcon(button, iconName) {
        if (!button) return;
        button.innerHTML = `<i data-lucide="${iconName}"></i>`;
        TMS.Utils.refreshIcons();
    },

    toggleTheme() {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        this.updateButtonIcon(TMS.EL.btnTheme, newTheme === 'dark' ? 'moon' : 'sun');
    },

    updateFontSize(delta) {
        if (delta) {
            TMS.STATE.fontSize = Math.max(8, Math.min(24, TMS.STATE.fontSize + delta));
        }
        TMS.EL.fontSizeDisplay.textContent = `${TMS.STATE.fontSize}pt`;
        document.documentElement.style.setProperty('--font-size-base', `${TMS.STATE.fontSize * 1.333}px`);
    },

    setVersion(version) {
        const versionTag = document.querySelector('.version-tag');
        if (versionTag && version) {
            versionTag.textContent = version;
        }
    },

    toggleKeywordsLock() {
        TMS.STATE.isKeywordsLocked = !TMS.STATE.isKeywordsLocked;
        TMS.EL.keywordsInput.readOnly = TMS.STATE.isKeywordsLocked;

        const icon = TMS.STATE.isKeywordsLocked ? 'lock' : 'unlock';
        const title = TMS.STATE.isKeywordsLocked ? 'Unlock Keywords' : 'Lock Keywords';

        this.updateButtonIcon(TMS.EL.btnKeywordsLock, icon);
        TMS.EL.btnKeywordsLock.title = title;
        TMS.EL.btnKeywordsLock.classList.toggle('locked', TMS.STATE.isKeywordsLocked);
        TMS.EL.btnKeywordsLock.classList.toggle('unlocked', !TMS.STATE.isKeywordsLocked);

        if (!TMS.STATE.isKeywordsLocked) {
            TMS.EL.keywordsInput.focus();
        }
    },

    updateActionButtonsState() {
        const hasResult = TMS.EL.outputDiv.textContent.trim().length > 0;
        const hasSource = TMS.EL.sourceInput.value.trim().length > 0;

        const setBtnState = (btn, isActive) => {
            if (btn) {
                btn.disabled = !isActive;
                btn.style.opacity = isActive ? '1' : '0.5';
                btn.style.pointerEvents = isActive ? 'auto' : 'none';
            }
        };

        setBtnState(TMS.EL.btnDownloadResult, hasResult);
        setBtnState(TMS.EL.btnCopyResult, hasResult);
        setBtnState(TMS.EL.btnCopySource, hasSource);
    },

    syncBackdrop() {
        if (!TMS.EL.keywordsInput || !TMS.EL.keywordsBackdrop) return;

        const text = TMS.EL.keywordsInput.value;
        const scroll = TMS.EL.keywordsInput.scrollTop;
        const lines = text.split('\n');

        const processed = lines.map(line => {
            const safeLine = TMS.Utils.escapeHtml(line);

            if (safeLine.trim().startsWith('///')) {
                return `<span class="comment">${safeLine}</span>`;
            }

            const sepIdx = safeLine.indexOf('///');
            const highlightSearch = (str) => {
                let s = str.replace(/^(\s*)(\[line\])/, '$1<span class="reserved">$2</span>');
                return s.replace(/(\[(?:num|cjk|kor|or)\])/g, '<span class="reserved">$1</span>');
            };

            if (sepIdx === -1) {
                return highlightSearch(safeLine);
            }

            const searchPart = safeLine.substring(0, sepIdx);
            const replacePart = safeLine.substring(sepIdx + 3);

            const searchHi = highlightSearch(searchPart);
            let replaceHi = replacePart;

            if (replacePart.trim() === '[del]') {
                replaceHi = replaceHi.replace(/\[del\]/, '<span class="reserved">[del]</span>');
            } else {
                replaceHi = replaceHi.replace(/(\[(?:num|cjk|kor)\])/g, '<span class="reserved">$1</span>');
                const isLineStart = searchPart.trim().startsWith('[line]');
                const hasWildcards = /\[(?:num|cjk|kor)\]/.test(searchPart);
                if (isLineStart && !hasWildcards) {
                    replaceHi = replaceHi.replace(/(\[line\])/g, '<span class="reserved">$1</span>');
                }
            }

            return `${searchHi}<span class="separator">///</span>${replaceHi}`;
        });

        TMS.EL.keywordsBackdrop.innerHTML = processed.join('<br>') + '<br>';
        TMS.EL.keywordsBackdrop.scrollTop = scroll;
    },

    // =========================================================================
    // [3] Navigation (D-pad & Scrolling)
    // =========================================================================

    navState: {
        index: -1,
        lastTime: 0
    },

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    scrollToBottom() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    },

    navigateMatch(direction) {
        const now = Date.now();
        if (now - this.navState.lastTime < TMS.CONFIG.NAV_THROTTLE) return;
        this.navState.lastTime = now;

        const matches = Array.from(document.querySelectorAll('.diff-add, .diff-replace'));
        if (matches.length === 0) return;

        // Find closest match to center of viewport
        const viewportTop = window.scrollY + (window.innerHeight / 2);
        let closestIndex = -1;
        let minDistance = Infinity;

        matches.forEach((match, index) => {
            const rect = match.getBoundingClientRect();
            const absoluteTop = window.scrollY + rect.top;
            const distance = Math.abs(absoluteTop - viewportTop);

            if (distance < minDistance) {
                minDistance = distance;
                closestIndex = index;
            }
        });

        // Sync index if lost or user scrolled
        if (this.navState.index === -1) {
            this.navState.index = closestIndex;
        } else {
            const currentRect = matches[this.navState.index].getBoundingClientRect();
            const closestRect = matches[closestIndex].getBoundingClientRect();

            // 1. Loop Prevention: Do NOT sync if on the same line (vertical pos similar)
            const SAME_LINE_THRESHOLD = 5; // pixels
            const isSameLine = Math.abs(currentRect.top - closestRect.top) < SAME_LINE_THRESHOLD;

            // 2. Intuitive Scrolling: Sync only if NOT on same line AND index is different
            if (!isSameLine && closestIndex !== this.navState.index) {
                this.navState.index = closestIndex;
            }
        }

        // Cycle index
        if (direction === 'next') {
            this.navState.index = (this.navState.index + 1) % matches.length;
        } else {
            this.navState.index = (this.navState.index - 1 + matches.length) % matches.length;
        }

        const target = matches[this.navState.index];

        // Scroll into view
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Temporary Highlight
        const HIGHLIGHT_DURATION_MS = 500;
        target.style.transition = 'filter 0.2s';
        target.style.filter = 'brightness(0.6) contrast(1.2)';
        setTimeout(() => {
            target.style.filter = '';
        }, HIGHLIGHT_DURATION_MS);
    }
};

// =============================================================================
// [3] File Manager
// =============================================================================
TMS.FileManager = {
    initDragAndDrop(zones) {
        const handleDrop = (e, callback, limit) => {
            e.preventDefault();
            e.target.closest('.input-wrapper')?.classList.remove('drag-active');
            const file = e.dataTransfer.files[0];
            if (file) {
                this._readFileContent(file, txt => {
                    if (callback) callback(file.name, txt);
                }, limit);
            }
        };

        zones.forEach(({ element, limit, onDrop }) => {
            const wrap = element.closest('.input-wrapper');
            if (!wrap) return;

            wrap.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrap.classList.add('drag-active');
            });
            wrap.addEventListener('dragleave', (e) => {
                if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-active');
            });
            wrap.addEventListener('drop', e => handleDrop(e, onDrop, limit));
        });
    },

    handleFileUpload(input, maxSize, onLoaded) {
        if (input.files[0]) {
            this._readFileContent(input.files[0], txt => {
                if (onLoaded) onLoaded(input.files[0].name, txt);
                input.value = '';
            }, maxSize);
        }
    },

    _readFileContent(file, callback, maxSize = TMS.CONFIG.MAX_SOURCE_FILE_SIZE) {
        if (file.size > maxSize) {
            return TMS.UIManager.showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Limit is ${(maxSize / 1024 / 1024).toFixed(1)}MB.`);
        }

        if (!this._isValidTextFile(file)) {
            return TMS.UIManager.showToast('Unsupported file type. Please upload a Text file.', 'error');
        }

        const r = new FileReader();
        r.onload = e => {
            callback(e.target.result);
        };
        r.readAsText(file);
    },

    _isValidTextFile(file) {
        if (file.type.startsWith('text/') ||
            file.type === 'application/json' ||
            file.type === 'application/xml' ||
            file.type === 'image/svg+xml' ||
            file.type.includes('javascript') ||
            file.type.includes('ecmascript')) {
            return true;
        }
        if (!file.name) return false;
        const lowerName = file.name.toLowerCase();
        return TMS.CONFIG.ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    },

    downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// =============================================================================
// [4] History Manager
// =============================================================================
TMS.HistoryManager = {
    performAction(isUndo) {
        const canAction = isUndo
            ? TMS.STATE.history.pointer > 0
            : TMS.STATE.history.pointer < TMS.STATE.history.stack.length - 1;

        if (canAction) {
            TMS.STATE.history.pointer += isUndo ? -1 : 1;
            const snapshot = TMS.STATE.history.stack[TMS.STATE.history.pointer];
            TMS.EL.outputDiv.innerHTML = snapshot.content;
            this.setCursorOffset(TMS.EL.outputDiv, snapshot.cursor);
            TMS.UIManager.updateActionButtonsState();
        }
    },

    insertUserText(text) {
        const span = document.createElement('span');
        span.className = 'diff-user';
        span.textContent = text;
        this.insertNodeAtCursor(span);
        TMS.UIManager.updateActionButtonsState();
    },

    insertNodeAtCursor(node) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const anchor = range.startContainer;
        const parent = anchor.parentElement;

        if (anchor.nodeType === Node.TEXT_NODE && TMS.Utils.isStyledSpan(parent)) {
            const latter = anchor.splitText(range.startOffset);
            const part2 = parent.cloneNode(false);
            part2.appendChild(latter);
            while (latter.nextSibling) part2.appendChild(latter.nextSibling);
            parent.after(part2);
            range.setStartAfter(parent);
            range.collapse(true);
        }

        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    },

    saveSnapshot() {
        if (TMS.STATE.isSynced) return;

        const content = TMS.EL.outputDiv.innerHTML;
        const cursor = this.getCursorOffset(TMS.EL.outputDiv);

        if (TMS.STATE.history.pointer >= 0 && TMS.STATE.history.stack[TMS.STATE.history.pointer].content === content) {
            return;
        }

        if (TMS.STATE.history.pointer < TMS.STATE.history.stack.length - 1) {
            TMS.STATE.history.stack = TMS.STATE.history.stack.slice(0, TMS.STATE.history.pointer + 1);
        }

        TMS.STATE.history.stack.push({ content, cursor });

        if (TMS.STATE.history.stack.length > TMS.STATE.history.limit) {
            TMS.STATE.history.stack.shift();
        } else {
            TMS.STATE.history.pointer++;
        }
    },

    debouncedSave() {
        clearTimeout(TMS.STATE.history.timer);
        TMS.STATE.history.timer = setTimeout(() => this.saveSnapshot(), TMS.CONFIG.HISTORY_DEBOUNCE);
    },

    getCursorOffset(container) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    },

    setCursorOffset(container, offset) {
        const range = document.createRange();
        const sel = window.getSelection();
        let currentOffset = 0;
        let found = false;

        function traverse(node) {
            if (found) return;
            if (node.nodeType === Node.TEXT_NODE) {
                const len = node.length;
                if (currentOffset + len >= offset) {
                    range.setStart(node, offset - currentOffset);
                    range.collapse(true);
                    found = true;
                } else {
                    currentOffset += len;
                }
            } else {
                node.childNodes.forEach(traverse);
            }
        }

        traverse(container);

        if (!found) {
            range.selectNodeContents(container);
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }
};
