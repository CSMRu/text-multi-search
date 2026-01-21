/**
 * Text Multi Search - Main Application
 * 
 * ==============================================================================
 * 1. CONFIGURATION & STATE .... Global settings
 * 2. UTILITIES ............... Helper functions
 * 3. CORE ENGINE ............. Search, Regex, and Parsing logic
 * 4. UI MANAGERS ............. DOM, Toast, Theme
 * 5. FEATURE MODULES ......... File I/O, History, Syntax Highlight
 * 6. INITIALIZATION .......... Event Listeners
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================================
       [1] CONFIGURATION & STATE
       - Global constants, DOM elements, and mutable state tracking
       ========================================================================================== */

    // DOM Elements - UI Nodes
    const EL = {
        // --- Inputs & Display ---
        sourceInput: document.getElementById('text-source'),
        keywordsInput: document.getElementById('text-keywords'),
        keywordsBackdrop: document.getElementById('keywords-backdrop'),
        outputDiv: document.getElementById('search-output'),

        // --- File Operations ---
        uploadSource: document.getElementById('upload-source'),
        btnUploadSource: document.getElementById('btn-upload-source'),
        fileNameSource: document.getElementById('file-name-source'),
        uploadKeywords: document.getElementById('upload-keywords'),
        btnUploadKeywords: document.getElementById('btn-upload-keywords'),
        fileNameKeywords: document.getElementById('file-name-keywords'),

        // --- Toolbar Controls ---
        btnTheme: document.getElementById('btn-theme'),
        btnFontInc: document.getElementById('font-increase'),
        btnFontDec: document.getElementById('font-decrease'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        btnSyncToggle: document.getElementById('btn-sync-toggle'),

        // --- Action Buttons ---
        btnKeywordsLock: document.getElementById('btn-keywords-lock'),
        btnCopySource: document.getElementById('btn-copy-source'),
        btnCopyResult: document.getElementById('btn-copy-result'),
        btnDownloadResult: document.getElementById('btn-download-result'),

        // --- Statistics ---
        countMatch: document.getElementById('count-match'),
        countReplace: document.getElementById('count-replace')
    };

    // Application State - Mutable data tracking the app's status
    const STATE = {
        fontSize: 12,           // Font size in points (pt)
        isSynced: true,         // Mode: true = Auto-Search (Read-only), false = Manual Edit
        isKeywordsLocked: true, // Keywords lock: true = Read-only, false = Editable
        isKeywordsDirty: true,  // Optimization: Only rebuild Regex if keywords changed
        cachedMatchers: null,   // Cache for compiled Regex objects
        debounceTimer: null,    // Timer for input debouncing

        // History Stack for Undo/Redo (Manual Edit Mode)
        history: {
            stack: [],
            pointer: -1,
            limit: 50,
            timer: null
        }
    };

    // Constants - immutable configuration values
    const CONFIG = {
        MAX_FILE_SIZE: 0.5 * 1024 * 1024, // Limit uploads to 500KB
        DEBOUNCE_DELAY: 150,            // ms to wait before searching after typing
        HISTORY_DEBOUNCE: 400           // ms to wait before saving undo snapshot
    };


    /* ==========================================================================================
       [2] UTILITIES
       - Helper functions for string manipulation and DOM logic
       ========================================================================================== */

    // HTML Entity Map
    const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

    /**
     * Safely escapes text to prevent HTML injection.
     * Use this whenever inserting user-generated text into innerHTML.
     */
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
    }

    /**
     * Escapes characters that have special meaning in Regular Expressions.
     */
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }



    /**
     * Re-initializes Lucide icons (if the library is loaded).
     * Call this after adding new icons to the DOM dynamically.
     */
    function refreshIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Schedules a search update.
     * Prevents the search from running too frequently while typing.
     */
    function requestUpdate() {
        if (STATE.debounceTimer) clearTimeout(STATE.debounceTimer);
        STATE.debounceTimer = setTimeout(processText, CONFIG.DEBOUNCE_DELAY);
    }

    /** Checks if a DOM element is a diff span */
    function isStyledSpan(el) {
        return el && (
            el.classList.contains('diff-add') ||
            el.classList.contains('diff-replace') ||
            el.classList.contains('diff-original')
        );
    }


    /* ==========================================================================================
       [3] CORE ENGINE (Worker Manager & Fallback)
       - Search logic validation, Worker communication, and Fallback execution
       ========================================================================================== */

    const WORKER_CONFIG = {
        TIMEOUT_MS: 3000 // 3 seconds timeout (Only works in Worker mode)
    };

    /**
     * Fallback Engine: Runs on main thread when Web Workers are unavailable (e.g., file://).
     * CAUTION: This shares logic with js/worker.js. Keep them in sync.
     */
    const FallbackEngine = {
        buildMatchers(keywordsValue) {
            const matchers = [];
            const lines = keywordsValue.split('\n');
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('///')) return;

                let search = trimmed;
                let replace = trimmed;
                let isReplacement = false;

                const sepIndex = trimmed.indexOf('///');
                if (sepIndex !== -1) {
                    search = trimmed.substring(0, sepIndex).trim();
                    replace = trimmed.substring(sepIndex + 3).trim();
                    if (replace === '[del]') replace = '';
                    isReplacement = true;
                }

                if (!search) return;

                try {
                    let replacePattern = replace;
                    let isLineMode = false;
                    if (search.startsWith('[line]')) {
                        isLineMode = true;
                        search = search.substring(6).trim();
                        if (!search) return;
                    }
                    const ESCAPED_OR_PLACEHOLDER = '\uFFFF';
                    let tempSearch = search.split('\\[or]').join(ESCAPED_OR_PLACEHOLDER);
                    const segments = tempSearch.split(/\s*\[or\]\s*/);
                    const wildcardOrder = [];
                    const processedSegments = segments.filter(s => s.length > 0).map(s => {
                        let content = s.split(ESCAPED_OR_PLACEHOLDER).join('[or]');
                        let p = escapeRegExp(content);
                        p = p.replace(/\\\[(num|cjk)\\\]/g, (match, type) => {
                            wildcardOrder.push(type);
                            if (type === 'num') return '(\\d+)';
                            if (type === 'cjk') return '([\\u4E00-\\u9FFF])';
                            return match;
                        });
                        return p;
                    });
                    if (processedSegments.length === 0) return;
                    const pattern = processedSegments.join('|');
                    if (isReplacement) {
                        replacePattern = replace.replace(/\$(?!\d)/g, () => '$$$$');
                        if (wildcardOrder.length > 0) {
                            let gIdx = 0;
                            replacePattern = replacePattern.replace(/\[(num|cjk)\]/g, (m, type) =>
                                (gIdx < wildcardOrder.length && wildcardOrder[gIdx] === type) ? `$${++gIdx}` : m
                            );
                        }
                    }
                    if (isLineMode && wildcardOrder.length === 0 && isReplacement && replacePattern.includes('[line]')) {
                        replacePattern = replacePattern.replace(/\[line\]/g, () => '$$LINE$$');
                    }
                    matchers.push({
                        regex: new RegExp(pattern, 'g'),
                        searchStr: search,
                        replace,
                        replacePattern,
                        isReplacement,
                        isLineMode
                    });
                } catch (e) {
                    console.warn("Invalid Regex:", search, e);
                }
            });
            return matchers;
        },

        processText(sourceText, keywordsValue) {
            if (!sourceText) return { html: '', countM: 0, countR: 0 };
            const matchers = this.buildMatchers(keywordsValue);
            if (matchers.length === 0) {
                return { html: `<span class="diff-original">${escapeHtml(sourceText)}</span>`, countM: 0, countR: 0 };
            }

            let cursor = 0, countM = 0, countR = 0;
            const resultParts = [];
            const getDisplayContent = (matcher, matchData) => {
                if (!matcher.isReplacement) return matchData.text;
                return matcher.replacePattern.replace(/(\$\$LINE\$\$)|(\$\$)|(\$(\d+))/g, (match, lineToken, escDollar, capGroup, grpIdx) => {
                    if (lineToken) return matchData.text.replace(/\r?\n$/, '');
                    if (escDollar) return '$';
                    if (capGroup) {
                        const idx = parseInt(grpIdx, 10) - 1;
                        return (matchData.groups[idx] !== undefined) ? matchData.groups[idx] : '';
                    }
                    return match;
                });
            };

            const priorityRanges = [];
            const lineMatchers = matchers.filter(m => m.isLineMode);
            if (lineMatchers.length > 0) {
                let lineRegex = /^[\s\S]*?(\r?\n|$)/gm;
                let lineMatch;
                while ((lineMatch = lineRegex.exec(sourceText)) !== null) {
                    if (!lineMatch[0]) break;
                    for (let m of lineMatchers) {
                        m.regex.lastIndex = 0;
                        const res = m.regex.exec(lineMatch[0]);
                        if (res) {
                            priorityRanges.push({
                                start: lineMatch.index,
                                end: lineMatch.index + lineMatch[0].length,
                                matcher: m,
                                matchData: { index: lineMatch.index, text: lineMatch[0], len: lineMatch[0].length, groups: res.slice(1) }
                            });
                            break;
                        }
                    }
                }
            }

            const textMatchers = matchers.filter(m => !m.isLineMode);
            textMatchers.forEach(m => m.regex.lastIndex = 0);
            const nextMatches = new Array(textMatchers.length).fill(undefined);
            let priorityIdx = 0;

            while (cursor < sourceText.length) {
                if (priorityIdx < priorityRanges.length) {
                    const pRange = priorityRanges[priorityIdx];
                    if (cursor === pRange.start) {
                        let content = getDisplayContent(pRange.matcher, pRange.matchData);
                        const cls = pRange.matcher.isReplacement ? 'diff-replace' : 'diff-add';
                        if (pRange.matcher.isReplacement) countR++; else countM++;
                        const originalText = pRange.matchData.text;
                        const trailingNewline = originalText.match(/\r?\n$/)?.[0] || '';
                        if (pRange.matcher.isReplacement && content && !content.endsWith('\n') && trailingNewline) {
                            content += trailingNewline;
                        }
                        resultParts.push(`<span class="${cls}">${escapeHtml(content)}</span>`);
                        cursor = pRange.end;
                        priorityIdx++;
                        continue;
                    }
                }

                let limit = (priorityIdx < priorityRanges.length) ? priorityRanges[priorityIdx].start : Infinity;
                let bestIdx = -1, minIndex = Infinity, bestLen = 0;

                for (let i = 0; i < textMatchers.length; i++) {
                    const m = textMatchers[i];
                    if (!nextMatches[i] || nextMatches[i].index < cursor) {
                        m.regex.lastIndex = cursor;
                        const res = m.regex.exec(sourceText);
                        nextMatches[i] = res ? { index: res.index, text: res[0], len: res[0].length, groups: res.slice(1) } : null;
                    }
                    const match = nextMatches[i];
                    if (match) {
                        if (match.index >= limit || match.index + match.len > limit) continue;
                        if (match.index < minIndex || (match.index === minIndex && match.len > bestLen)) {
                            minIndex = match.index;
                            bestLen = match.len;
                            bestIdx = i;
                        }
                    }
                }

                if (bestIdx === -1) {
                    const nextTarget = (limit === Infinity) ? sourceText.length : limit;
                    if (nextTarget > cursor) resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, nextTarget))}</span>`);
                    cursor = nextTarget;
                    continue;
                }

                if (minIndex > cursor) resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);

                const bestM = textMatchers[bestIdx];
                const bestData = nextMatches[bestIdx];
                const content = getDisplayContent(bestM, bestData);
                const cls = bestM.isReplacement ? 'diff-replace' : 'diff-add';
                if (bestM.isReplacement) countR++; else countM++;
                resultParts.push(`<span class="${cls}">${escapeHtml(content)}</span>`);
                cursor = minIndex + bestData.len;
            }

            return { html: resultParts.join(''), countM, countR };
        }
    };

    /**
     * Manages Web Worker for search operations.
     */
    const WorkerManager = {
        worker: null,
        timer: null,
        currentId: 0,
        isLoading: false,
        useFallback: false,

        init() {
            if (window.location.protocol === 'file:') {
                this.useFallback = true;
                showToast('Running in local mode (No Worker).', 'info');
                console.warn('Worker disabled due to file:// protocol. Using FallbackEngine.');
                return;
            }
            try {
                if (this.worker) this.worker.terminate();
                this.worker = new Worker('js/worker.js');
                this.worker.onmessage = this.handleMessage.bind(this);
                this.worker.onerror = (e) => {
                    console.error('Worker Error:', e);
                    this.useFallback = true; // Switch to fallback on error
                    this.finishState();
                    showToast('Worker failed. Switching to Sync mode.', 'error');
                };
            } catch (e) {
                this.useFallback = true;
                console.error('Worker Init Failed:', e);
                showToast('Worker initialization failed. Switching to Sync mode.', 'error');
            }
        },

        postMessage(sourceText, keywordsValue) {
            if (!this.worker && !this.useFallback) this.init();

            this.currentId++;
            this.setLoading(true);

            // Synchronous Fallback
            if (this.useFallback) {
                // Use setTimeout to allow UI to render Loading Bar briefly
                setTimeout(() => {
                    try {
                        const result = FallbackEngine.processText(sourceText, keywordsValue);
                        this.handleMessage({ data: { id: this.currentId, status: 'success', ...result } });
                    } catch (e) {
                        this.handleMessage({ data: { id: this.currentId, status: 'error', message: e.message } });
                    }
                }, 10);
                return;
            }

            // Cancel previous timeout
            if (this.timer) clearTimeout(this.timer);

            // Set Safety Timeout
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
            const { id, status, html, countM, countR, message } = e.data;

            // Ignore old results
            if (id !== this.currentId) return;

            clearTimeout(this.timer);
            this.setLoading(false);

            if (status === 'success') {
                EL.outputDiv.innerHTML = html;
                EL.countMatch.textContent = countM;
                EL.countReplace.textContent = countR;
                updateActionButtonsState();
            } else {
                showToast(message || 'Unknown Error', 'error');
            }
        },

        handleTimeout() {
            this.worker.terminate(); // Kill the frozen worker
            this.worker = null; // Force re-init next time
            this.setLoading(false);

            showToast('Search Timed Out (Too complex)', 'error');
            EL.outputDiv.innerHTML += '<div style="color:var(--diff-del-text); padding:1rem; font-weight:bold; border:1px solid var(--diff-del-text); margin-top:1rem;">⚠️ Calculation Timed Out. Please simplify your keywords.</div>';
        },

        setLoading(active) {
            this.isLoading = active;
            const bar = document.getElementById('loading-bar');
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

    // Initialize Worker
    WorkerManager.init();


    /**
     * Bridge function to request search update.
     */
    function processText() {
        if (!STATE.isSynced) return;

        // Optimizations
        const sourceText = EL.sourceInput.value;
        const keywordsValue = EL.keywordsInput.value;

        if (!sourceText) {
            EL.outputDiv.innerHTML = '';
            EL.countMatch.textContent = '0';
            EL.countReplace.textContent = '0';
            updateActionButtonsState();
            return;
        }

        WorkerManager.postMessage(sourceText, keywordsValue);
    }


    /* ==========================================================================================
       [4] UI & DOM MANAGEMENT
       - Toast notifications, Theme toggles, Font size control, and Button states
       ========================================================================================== */

    /** Displays a temporary toast notification at the top of the screen */
    function showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icon = { error: 'alert-circle', success: 'check-circle', info: 'info' }[type] || 'alert-circle';
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon"><i data-lucide="${icon}"></i></span><span>${escapeHtml(message)}</span>`;

        container.appendChild(toast);
        refreshIcons();

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /** Updates Button UI (Enabled/Disabled) based on input state */
    function updateActionButtonsState() {
        const hasResult = EL.outputDiv.textContent.trim().length > 0;
        const hasSource = EL.sourceInput.value.trim().length > 0;

        const setBtnState = (btn, isActive) => {
            if (btn) {
                btn.disabled = !isActive;
                btn.style.opacity = isActive ? '1' : '0.5';
                btn.style.pointerEvents = isActive ? 'auto' : 'none';
            }
        };

        setBtnState(EL.btnDownloadResult, hasResult);
        setBtnState(EL.btnCopyResult, hasResult);
        setBtnState(EL.btnCopySource, hasSource);
    }

    /** Changes font size and updates CSS variable */
    function updateFontSize(delta) {
        if (delta) {
            STATE.fontSize = Math.max(8, Math.min(24, STATE.fontSize + delta));
        }
        EL.fontSizeDisplay.textContent = `${STATE.fontSize}pt`;
        document.documentElement.style.setProperty('--font-size-base', `${STATE.fontSize * 1.333}px`);
    }

    /** Toggles Dark/Light theme */
    function toggleTheme() {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);

        if (EL.btnTheme) {
            EL.btnTheme.innerHTML = `<i data-lucide="${newTheme === 'dark' ? 'moon' : 'sun'}"></i>`;
            refreshIcons();
        }
    }

    /** Toggles Keywords lock (Read-only ↔ Editable) */
    function toggleKeywordsLock() {
        STATE.isKeywordsLocked = !STATE.isKeywordsLocked;
        EL.keywordsInput.readOnly = STATE.isKeywordsLocked;

        const icon = STATE.isKeywordsLocked ? 'lock' : 'unlock';
        const title = STATE.isKeywordsLocked ? 'Unlock Keywords' : 'Lock Keywords';

        EL.btnKeywordsLock.innerHTML = `<i data-lucide="${icon}"></i>`;
        EL.btnKeywordsLock.title = title;

        // Toggle visual state classes
        EL.btnKeywordsLock.classList.toggle('locked', STATE.isKeywordsLocked);
        EL.btnKeywordsLock.classList.toggle('unlocked', !STATE.isKeywordsLocked);

        refreshIcons();

        // Focus input if unlocked
        if (!STATE.isKeywordsLocked) {
            EL.keywordsInput.focus();
        }
    }


    /* ==========================================================================================
       [5] FEATURE MODULES
       - File I/O, Undo/Redo History, Syntax Highlighting
       ========================================================================================== */

    /* --- 5.1 File I/O --- */

    // Allowed extensions for source code and text files
    const ALLOWED_EXTENSIONS = [
        '.txt', '.md', '.markdown',
        '.js', '.jsx', '.ts', '.tsx', '.json',
        '.html', '.htm', '.css', '.scss', '.less',
        '.xml', '.svg', '.log', '.csv', '.yml', '.yaml',
        '.ini', '.conf', '.sh', '.bat', '.ps1'
    ];

    /**
     * strict validation to ensure file is safe text.
     * Checks both MIME type and Extension whitelists.
     */
    function isValidTextFile(file) {
        // 1. Pass if MIME type explicitly claims to be text or script
        if (file.type.startsWith('text/') ||
            file.type === 'application/json' ||
            file.type === 'application/xml' ||
            file.type === 'image/svg+xml' ||
            file.type.includes('javascript') ||
            file.type.includes('ecmascript')) {
            return true;
        }

        // 2. Fallback: If MIME is empty/generic, check Extension Whitelist
        if (!file.name) return false;
        const lowerName = file.name.toLowerCase();
        return ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    }

    function readFileContent(file, callback) {
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            return showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        }

        // Strict Whitelist Validation
        if (!isValidTextFile(file)) {
            return showToast('Unsupported file type. Please upload a Text file.', 'error');
        }

        const r = new FileReader();
        r.onload = e => {
            callback(e.target.result);
            processText();
        };
        r.readAsText(file);
    }

    function handleFileUpload(input, area, display) {
        if (input.files[0]) {
            readFileContent(input.files[0], txt => {
                if (display) display.textContent = input.files[0].name;
                area.value = txt;
                input.value = '';
                if (area === EL.keywordsInput) {
                    STATE.isKeywordsDirty = true;
                    setTimeout(syncBackdrop, 0); // Trigger highlighting update
                }
            });
        }
    }

    /* --- 5.2 History (Undo/Redo) --- */

    // Snapshots the current HTML content for Undo/Redo
    function saveHistorySnapshot() {
        if (STATE.isSynced) return; // Only save in Manual Edit mode

        const content = EL.outputDiv.innerHTML;
        const cursor = getCursorOffset(EL.outputDiv);

        // Deduplication: Don't save if identical to top of stack
        if (STATE.history.pointer >= 0 && STATE.history.stack[STATE.history.pointer].content === content) {
            return;
        }

        // Branching: If we are in middle of stack and editing, discard future (redo) history
        if (STATE.history.pointer < STATE.history.stack.length - 1) {
            STATE.history.stack = STATE.history.stack.slice(0, STATE.history.pointer + 1);
        }

        STATE.history.stack.push({ content, cursor });

        // Maintain limit
        if (STATE.history.stack.length > STATE.history.limit) {
            STATE.history.stack.shift();
        } else {
            STATE.history.pointer++;
        }
    }

    const debouncedSaveHistory = () => {
        clearTimeout(STATE.history.timer);
        STATE.history.timer = setTimeout(saveHistorySnapshot, CONFIG.HISTORY_DEBOUNCE);
    };

    function performHistoryAction(isUndo) {
        const canAction = isUndo
            ? STATE.history.pointer > 0
            : STATE.history.pointer < STATE.history.stack.length - 1;

        if (canAction) {
            STATE.history.pointer += isUndo ? -1 : 1;
            const s = STATE.history.stack[STATE.history.pointer];
            EL.outputDiv.innerHTML = s.content;
            setCursorOffset(EL.outputDiv, s.cursor);
            updateActionButtonsState();
        }
    }

    // Helper: Get cursor position as a character offset
    function getCursorOffset(container) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;

        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return preCaretRange.toString().length;
    }

    // Helper: Set cursor position from character offset
    function setCursorOffset(container, offset) {
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

    /* --- 5.3 Manual Edit Helper --- */

    // Inserts a node (like a newline or span) at the current cursor
    function insertNodeAtCursor(node) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();

        // If insert happens inside a styled span (diff), we must split it
        // so the new content isn't styled as diff
        const anchor = range.startContainer;
        const parent = anchor.parentElement;

        if (anchor.nodeType === Node.TEXT_NODE && isStyledSpan(parent)) {
            const latter = anchor.splitText(range.startOffset);
            const part2 = parent.cloneNode(false);
            part2.appendChild(latter);

            while (latter.nextSibling) part2.appendChild(latter.nextSibling);

            parent.after(part2);
            parent.after(node);

            // Cleanup empty nodes
            if (!parent.textContent) parent.remove();
            if (!part2.textContent) part2.remove();
        } else {
            range.insertNode(node);
        }

        const newRange = document.createRange();
        newRange.setStartAfter(node);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
    }

    // Wraps newly typed text in a 'diff-user' span (User Edit highlight)
    function wrapLastChars(len) {
        if (!len) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType !== Node.TEXT_NODE || !isStyledSpan(node.parentElement)) return;

        const end = range.startOffset;
        const start = end - len;
        if (start < 0) return;

        const parent = node.parentElement;
        const textWrap = node.splitText(start);
        const textAfter = textWrap.splitText(len);

        const pClone = parent.cloneNode(false);
        pClone.appendChild(textAfter);
        while (textAfter.nextSibling) pClone.appendChild(textAfter.nextSibling);

        const span = document.createElement('span');
        span.className = 'diff-user';
        span.appendChild(textWrap);

        parent.after(pClone);
        parent.after(span);

        if (!parent.textContent) parent.remove();
        if (!pClone.textContent) pClone.remove();

        const cr = document.createRange();
        cr.selectNodeContents(span);
        cr.collapse(false);
        sel.removeAllRanges();
        sel.addRange(cr);
    }

    /* --- 5.4 Syntax Highlighting (for Keywords Input) --- */

    function syncBackdrop() {
        if (!EL.keywordsBackdrop || !EL.keywordsInput) return;

        const highlight = (s) => escapeHtml(s)
            .replace(/^(?:\s*)(?:\[line\])/, m => `<span class="reserved">${m}</span>`)
            .replace(/\[num\]|\[cjk\]|\[or\]/g, m => `<span class="reserved">${m}</span>`);

        const html = EL.keywordsInput.value.split('\n').map(line => {
            if (line.trim().startsWith('///')) {
                return `<span class="comment">${escapeHtml(line)}</span>`;
            }

            const sep = line.indexOf('///');
            if (sep !== -1) {
                const head = line.substring(0, sep + 3);
                const tail = line.substring(sep + 3);

                const hasLine = head.trim().startsWith('[line]');
                const tailRegex = hasLine ? /\[num\]|\[cjk\]|\[del\]|\[line\]/g : /\[num\]|\[cjk\]|\[del\]/g;

                const hHead = highlight(head);
                const hTail = escapeHtml(tail).replace(tailRegex, m => `<span class="reserved">${m}</span>`);

                return hHead + hTail;
            }
            return highlight(line);
        }).join('\n') + (EL.keywordsInput.value.endsWith('\n') ? '<br>' : '');

        EL.keywordsBackdrop.innerHTML = html;
        EL.keywordsBackdrop.scrollTop = EL.keywordsInput.scrollTop;
        EL.keywordsBackdrop.scrollLeft = EL.keywordsInput.scrollLeft;
    }

    const initSyntaxHighlighting = () => {
        syncBackdrop();
        new ResizeObserver(() => {
            EL.keywordsBackdrop.style.width = `${EL.keywordsInput.clientWidth}px`;
        }).observe(EL.keywordsInput);
    };


    /* ==========================================================================================
       [6] INITIALIZATION & EVENT LISTENERS
       - Drag & Drop, Button Clicks, Keyboard Shortcuts
       ========================================================================================== */

    /** Initializes Drag & Drop for file inputs */
    function initDragAndDrop() {
        const handleDrop = (e, area, nameDisplay) => {
            e.preventDefault();
            e.target.closest('.input-wrapper')?.classList.remove('drag-active');

            const file = e.dataTransfer.files[0];
            if (file) {
                readFileContent(file, txt => {
                    if (nameDisplay) nameDisplay.textContent = file.name;
                    area.value = txt;
                    if (area === EL.keywordsInput) {
                        STATE.isKeywordsDirty = true;
                        setTimeout(syncBackdrop, 0);
                    }
                });
            }
        };

        [
            { el: EL.sourceInput, name: EL.fileNameSource },
            { el: EL.keywordsInput, name: EL.fileNameKeywords }
        ].forEach(({ el, name }) => {
            const wrap = el.closest('.input-wrapper');
            if (!wrap) return;

            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
                wrap.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
            });

            wrap.addEventListener('dragenter', () => wrap.classList.add('drag-active'));
            wrap.addEventListener('dragleave', (e) => {
                if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-active');
            });
            wrap.addEventListener('drop', e => handleDrop(e, el, name));
        });
    }

    // --- Wire up all Event Listeners ---

    // 1. Text Inputs (Triggers search/highlight)
    EL.sourceInput.addEventListener('input', requestUpdate);
    EL.keywordsInput.addEventListener('input', () => {
        STATE.isKeywordsDirty = true;
        syncBackdrop();
        requestUpdate();
    });
    EL.keywordsInput.addEventListener('scroll', () => {
        if (EL.keywordsBackdrop) {
            EL.keywordsBackdrop.scrollTop = EL.keywordsInput.scrollTop;
            EL.keywordsBackdrop.scrollLeft = EL.keywordsInput.scrollLeft;
        }
    });

    // 2. File Upload Buttons
    // Trigger hidden file input when upload button is clicked
    EL.btnUploadSource?.addEventListener('click', () => EL.uploadSource?.click());
    EL.btnUploadKeywords?.addEventListener('click', () => EL.uploadKeywords?.click());

    // Handle file selection
    if (EL.uploadSource) {
        EL.uploadSource.addEventListener('change', () => handleFileUpload(EL.uploadSource, EL.sourceInput, EL.fileNameSource));
    }
    if (EL.uploadKeywords) {
        EL.uploadKeywords.addEventListener('change', () => handleFileUpload(EL.uploadKeywords, EL.keywordsInput, EL.fileNameKeywords));
    }

    // 3. UI Controls (Theme, Font, Keywords Lock)
    EL.btnTheme?.addEventListener('click', toggleTheme);
    EL.btnFontInc?.addEventListener('click', () => updateFontSize(1));
    EL.btnFontDec?.addEventListener('click', () => updateFontSize(-1));
    EL.btnKeywordsLock?.addEventListener('click', toggleKeywordsLock);

    // 4. Sync/Edit Mode Toggle
    EL.btnSyncToggle?.addEventListener('click', () => {
        STATE.isSynced = !STATE.isSynced;

        const [icon, title, clsMethod] = STATE.isSynced
            ? ['link', 'Unlink to Edit Result', 'remove']
            : ['unlink', 'Relink to Sync', 'add'];

        EL.btnSyncToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
        EL.btnSyncToggle.title = title;
        EL.btnSyncToggle.classList[clsMethod]('active');

        EL.outputDiv.setAttribute('contenteditable', !STATE.isSynced);

        if (STATE.isSynced) {
            EL.outputDiv.style.outline = 'none';
            processText(); // Re-run search
        } else {
            EL.outputDiv.focus();
            // Initialize history for the first time entering manual mode
            STATE.history.stack = [{ content: EL.outputDiv.innerHTML, cursor: 0 }];
            STATE.history.pointer = 0;
        }
        refreshIcons();
    });

    // 5. Clipboard & Download
    /** 
     * Handles copy to clipboard with visual feedback (check icon)
     */
    const copyHandler = (btn, textFn) => {
        if (!textFn()) return;
        navigator.clipboard.writeText(textFn()).then(() => {
            showToast('Copied!', 'success');
            const oldHtml = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check"></i>';
            refreshIcons();
            setTimeout(() => {
                btn.innerHTML = oldHtml;
                refreshIcons();
            }, 2000);
        }).catch(() => showToast('Failed.', 'error'));
    };

    EL.btnCopyResult?.addEventListener('click', () => copyHandler(EL.btnCopyResult, () => EL.outputDiv.innerText));
    EL.btnCopySource?.addEventListener('click', () => copyHandler(EL.btnCopySource, () => EL.sourceInput.value));

    EL.btnDownloadResult?.addEventListener('click', () => {
        if (!EL.outputDiv.textContent) return;

        const blob = new Blob([EL.outputDiv.innerText], { type: 'text/plain' });
        const now = new Date();
        const ts = now.toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '-');

        let name = EL.fileNameSource.textContent || 'result';
        if (name.includes('.')) name = name.substring(0, name.lastIndexOf('.'));

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `TMS-${name}_${ts}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast('Download started', 'success');
    });

    // 6. Manual Edit Events (Undo/Redo/Typing)
    EL.outputDiv.addEventListener('compositionend', e => {
        if (!STATE.isSynced && e.data) wrapLastChars(e.data.length);
    });

    EL.outputDiv.addEventListener('input', e => {
        if (STATE.isSynced) return;
        debouncedSaveHistory();
        if (!e.isComposing && e.inputType === 'insertText' && e.data) wrapLastChars(e.data.length);
        updateActionButtonsState();
    });

    EL.outputDiv.addEventListener('keydown', e => {
        if (STATE.isSynced) return;

        // Ctrl+Z (Undo)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            performHistoryAction(true);
            return;
        }
        // Ctrl+Y or Ctrl+Shift+Z (Redo)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            performHistoryAction(false);
            return;
        }

        // Enter Key override
        if (e.key === 'Enter') {
            e.preventDefault();
            saveHistorySnapshot();
            const s = document.createElement('span');
            s.className = 'diff-user';
            s.textContent = '\n';
            insertNodeAtCursor(s);
            debouncedSaveHistory();
            updateActionButtonsState();
        }
    });

    EL.outputDiv.addEventListener('paste', e => {
        if (STATE.isSynced) return;
        e.preventDefault();

        const t = (e.clipboardData || window.clipboardData).getData('text');
        if (!t) return;

        saveHistorySnapshot();
        const s = document.createElement('span');
        s.className = 'diff-user';
        s.textContent = t;
        insertNodeAtCursor(s);
        saveHistorySnapshot();
        updateActionButtonsState();
    });

    // --- Start Application ---
    // Set initial keywords lock state
    if (EL.keywordsInput) {
        EL.keywordsInput.readOnly = STATE.isKeywordsLocked;
    }

    initSyntaxHighlighting();
    initDragAndDrop();
    processText(); // Initial empty run to set states
    refreshIcons(); // Initialize icons
});
