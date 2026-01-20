/**
 * Text Multi Search - Main Application Logic
 * 
 * Structure:
 * 1. Constants & State
 * 2. Utility Functions (Pure helpers)
 * 3. UI Component Functions (DOM manipulation)
 * 4. Core Logic (Search algorithm)
 * 5. Feature Modules (History, Files, Editor)
 * 6. Initialization & Event Listeners
 *
 * CSS Architecture:
 * - base.css: Reset, Theme Variables, and Typography
 * - layout.css: Structural Layout (Grid/Flexbox)
 * - components.css: Component-specific styling
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       1. Constants & State
       ========================================================================== */

    const EL = {
        // Inputs
        sourceInput: document.getElementById('text-source'),
        keywordsInput: document.getElementById('text-keywords'),
        keywordsBackdrop: document.getElementById('keywords-backdrop'),
        outputDiv: document.getElementById('search-output'),

        // File Operations
        uploadSource: document.getElementById('upload-source'),
        fileNameSource: document.getElementById('file-name-source'),
        uploadKeywords: document.getElementById('upload-keywords'),
        fileNameKeywords: document.getElementById('file-name-keywords'),

        // Controls & Buttons
        btnTheme: document.getElementById('btn-theme'),
        btnFontInc: document.getElementById('font-increase'),
        btnFontDec: document.getElementById('font-decrease'),
        fontSizeDisplay: document.getElementById('font-size-display'),

        btnSyncToggle: document.getElementById('btn-sync-toggle'),
        btnRegexToggle: document.getElementById('btn-regex-toggle'),
        btnCopySource: document.getElementById('btn-copy-source'),
        btnCopyResult: document.getElementById('btn-copy-result'),
        btnDownloadResult: document.getElementById('btn-download-result'),

        // Stats
        countMatch: document.getElementById('count-match'),
        countReplace: document.getElementById('count-replace')
    };

    const STATE = {
        fontSize: 12,        // Current font size in pt
        isSynced: true,      // true: Search Mode (Read-only), false: Edit Mode (Manual)
        isRegexMode: false,  // true: Treat keywords as Regex
        isKeywordsDirty: true, // Flag to rebuild matchers only when keywords change

        // Caching for performance
        cachedMatchers: null,
        debounceTimer: null,

        // History (Undo/Redo)
        history: {
            stack: [],
            pointer: -1,
            limit: 50,
            timer: null
        }
    };

    const CONFIG = {
        MAX_FILE_SIZE: 1 * 1024 * 1024, // 1MB
        DEBOUNCE_DELAY: 150,
        HISTORY_DEBOUNCE: 400
    };


    /* ==========================================================================
       2. Utility Functions
       ========================================================================== */

    const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Debounces input events to prevent excessive processing during typing
    function requestUpdate() {
        if (STATE.debounceTimer) clearTimeout(STATE.debounceTimer);
        STATE.debounceTimer = setTimeout(() => {
            processText();
        }, CONFIG.DEBOUNCE_DELAY);
    }

    // Check if element is a styled diff span (add, replace, or original)
    const isStyledSpan = (el) => el && (
        el.classList.contains('diff-add') ||
        el.classList.contains('diff-replace') ||
        el.classList.contains('diff-original')
    );

    // Calculates global character offset relative to container, handling nested nodes
    // Essential for tracking cursor position across contenteditable updates
    function getCursorOffset(container) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }

    // Helper: Set global cursor position by character offset
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
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverse(node.childNodes[i]);
                }
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


    /* ==========================================================================
       3. UI Component Functions
       ========================================================================== */

    function showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const iconMap = { error: 'alert-circle', success: 'check-circle', info: 'info' };
        const icon = iconMap[type] || 'alert-circle';

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon"><i data-lucide="${icon}"></i></span>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function updateActionButtonsState() {
        const setBtnState = (btn, hasContent) => {
            if (btn) {
                btn.disabled = !hasContent;
                btn.style.opacity = hasContent ? '1' : '0.5';
                btn.style.pointerEvents = hasContent ? 'auto' : 'none';
            }
        };

        const hasResultText = EL.outputDiv.textContent.trim().length > 0;
        setBtnState(EL.btnDownloadResult, hasResultText);
        setBtnState(EL.btnCopyResult, hasResultText);

        const hasSourceText = EL.sourceInput.value.trim().length > 0;
        setBtnState(EL.btnCopySource, hasSourceText);
    }

    function updateFontSize() {
        EL.fontSizeDisplay.textContent = `${STATE.fontSize}pt`;
        // Convert pt to px approximate (1pt = 1.333px)
        const sizePx = STATE.fontSize * 1.333;
        document.documentElement.style.setProperty('--font-size-base', `${sizePx}px`);
    }

    function toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);

        if (EL.btnTheme) {
            EL.btnTheme.innerHTML = `<i data-lucide="${newTheme === 'dark' ? 'moon' : 'sun'}"></i>`;
            if (window.lucide) window.lucide.createIcons();
        }
    }


    /* ==========================================================================
       4. Core Logic (Search Platform)
       ========================================================================== */

    function buildMatchers(keywordsValue) {
        const lines = keywordsValue.split('\n');
        const matchers = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) return;

            let search = trimmed;
            let replace = trimmed;
            let isReplacement = false;

            // Handle "search // replace" syntax
            // Example: "apple // orange" -> Search "apple", Replace with "orange"
            const separator = ' // ';
            const sepIndex = trimmed.indexOf(separator);

            if (sepIndex !== -1) {
                search = trimmed.substring(0, sepIndex).trim();
                replace = trimmed.substring(sepIndex + separator.length).trim();
                isReplacement = true;
            }

            if (!search) return;

            try {
                let regex;
                if (STATE.isRegexMode && search.startsWith('/') && search.endsWith('/') && search.length > 2) {
                    regex = new RegExp(search.slice(1, -1), 'g');
                } else {
                    // Smart Wildcard: Replace [num] with \d+ anywhere in the string
                    // 1. Escape the base string to treat special chars (like dots/brackets) literally
                    let pattern = escapeRegExp(search);
                    // 2. Identify the escaped sequence for [num] (which is \[num\]) and replace with digit matcher
                    pattern = pattern.replace(/\\\[num\\\]/g, '\\d+');
                    // 3. Replace [cjk] with CJK Unified Ideographs range (single character)
                    pattern = pattern.replace(/\\\[cjk\\\]/g, '[\u4E00-\u9FFF]');
                    regex = new RegExp(pattern, 'g');
                }
                matchers.push({ regex, searchStr: search, replace, isReplacement });
            } catch (e) {
                console.warn("Invalid Regex:", search, e);
            }
        });
        return matchers;
    }

    function processText() {
        if (!STATE.isSynced) return;

        const sourceText = EL.sourceInput.value;
        const keywordsValue = EL.keywordsInput.value;

        if (STATE.isKeywordsDirty) {
            STATE.cachedMatchers = buildMatchers(keywordsValue);
            STATE.isKeywordsDirty = false;
        }

        const matchers = STATE.cachedMatchers;

        // Handle empty cases
        if (!sourceText || matchers.length === 0) {
            EL.outputDiv.innerHTML = sourceText ? `<span class="diff-original">${escapeHtml(sourceText)}</span>` : '';
            EL.countMatch.textContent = '0';
            EL.countReplace.textContent = '0';
            updateActionButtonsState();
            return;
        }

        let cursor = 0;
        let countM = 0;
        let countR = 0;
        const resultParts = [];

        // Reset state
        matchers.forEach(m => m.regex.lastIndex = 0);
        const nextMatches = new Array(matchers.length).fill(undefined);

        // Jump-Scanning Loop
        while (cursor < sourceText.length) {
            let bestMatcherIndex = -1;
            let minIndex = Infinity;
            let bestLen = 0;

            for (let i = 0; i < matchers.length; i++) {
                const m = matchers[i];
                let match = nextMatches[i];

                if (match === undefined || (match && match.index < cursor)) {
                    m.regex.lastIndex = cursor;
                    const res = m.regex.exec(sourceText);
                    nextMatches[i] = res ? { index: res.index, text: res[0], len: res[0].length } : null;
                    match = nextMatches[i];
                }

                if (match) {
                    if (match.index < minIndex) {
                        minIndex = match.index;
                        bestLen = match.len;
                        bestMatcherIndex = i;
                    } else if (match.index === minIndex && match.len > bestLen) {
                        bestLen = match.len;
                        bestMatcherIndex = i;
                    }
                }
            }

            if (bestMatcherIndex === -1) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor))}</span>`);
                break;
            }

            if (minIndex > cursor) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);
            }

            const bestM = matchers[bestMatcherIndex];
            const bestMatchData = nextMatches[bestMatcherIndex];
            const className = bestM.isReplacement ? 'diff-replace' : 'diff-add';
            const displayContent = bestM.isReplacement ? bestM.replace : bestMatchData.text;

            if (bestM.isReplacement) countR++; else countM++;
            resultParts.push(`<span class="${className}">${escapeHtml(displayContent)}</span>`);

            const nextCursor = minIndex + bestMatchData.len;
            if (nextCursor === cursor) {
                if (cursor < sourceText.length) {
                    resultParts.push(`<span class="diff-original">${escapeHtml(sourceText[cursor])}</span>`);
                }
                cursor++;
            } else {
                cursor = nextCursor;
            }
        }

        EL.outputDiv.innerHTML = resultParts.join('');
        EL.countMatch.textContent = countM;
        EL.countReplace.textContent = countR;
        updateActionButtonsState();
    }


    /* ==========================================================================
       5. Feature Modules
       ========================================================================== */

    /* --- History Module (Undo/Redo) --- */
    function saveHistorySnapshot() {
        if (STATE.isSynced) return;

        const content = EL.outputDiv.innerHTML;
        const cursor = getCursorOffset(EL.outputDiv);

        if (STATE.history.pointer >= 0 && STATE.history.stack[STATE.history.pointer].content === content) {
            return;
        }

        if (STATE.history.pointer < STATE.history.stack.length - 1) {
            STATE.history.stack = STATE.history.stack.slice(0, STATE.history.pointer + 1);
        }

        STATE.history.stack.push({ content, cursor });

        if (STATE.history.stack.length > STATE.history.limit) {
            STATE.history.stack.shift();
        } else {
            STATE.history.pointer++;
        }
    }

    function debouncedSaveHistory() {
        if (STATE.history.timer) clearTimeout(STATE.history.timer);
        STATE.history.timer = setTimeout(saveHistorySnapshot, CONFIG.HISTORY_DEBOUNCE);
    }

    function performUndo() {
        if (STATE.history.pointer > 0) {
            STATE.history.pointer--;
            const snapshot = STATE.history.stack[STATE.history.pointer];
            EL.outputDiv.innerHTML = snapshot.content;
            setCursorOffset(EL.outputDiv, snapshot.cursor);
            updateActionButtonsState();
        }
    }

    function performRedo() {
        if (STATE.history.pointer < STATE.history.stack.length - 1) {
            STATE.history.pointer++;
            const snapshot = STATE.history.stack[STATE.history.pointer];
            EL.outputDiv.innerHTML = snapshot.content;
            setCursorOffset(EL.outputDiv, snapshot.cursor);
            updateActionButtonsState();
        }
    }

    // Wrap newly typed characters in diff-user span when inside styled span
    function wrapLastChars(length) {
        if (!length) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return;

        const parent = node.parentElement;
        if (!parent || !EL.outputDiv.contains(parent)) return;
        if (!isStyledSpan(parent)) return;

        const endOffset = range.startOffset;
        const startOffset = endOffset - length;
        if (startOffset < 0) return;

        try {
            const textToWrap = node.splitText(startOffset);
            const textAfter = textToWrap.splitText(length);

            const parentClone = parent.cloneNode(false);
            parentClone.appendChild(textAfter);
            while (textAfter.nextSibling) {
                parentClone.appendChild(textAfter.nextSibling);
            }

            const newSpan = document.createElement('span');
            newSpan.className = 'diff-user';
            newSpan.appendChild(textToWrap);

            parent.after(parentClone);
            parent.after(newSpan);

            if (!parent.textContent) parent.remove();
            if (!parentClone.textContent) parentClone.remove();

            const cursorRange = document.createRange();
            cursorRange.selectNodeContents(newSpan);
            cursorRange.collapse(false);
            sel.removeAllRanges();
            sel.addRange(cursorRange);
        } catch (e) {
            console.error('wrapLastChars failed:', e);
        }
    }

    // Split styled span and insert content between the parts (used for Enter/Paste)
    function splitAndInsert(range, contentSpan) {
        const anchor = range.startContainer;
        const parent = anchor.parentElement;

        if (anchor.nodeType === Node.TEXT_NODE && isStyledSpan(parent)) {
            const latterTextNode = anchor.splitText(range.startOffset);
            const part2Span = parent.cloneNode(false);
            part2Span.appendChild(latterTextNode);

            while (latterTextNode.nextSibling) {
                part2Span.appendChild(latterTextNode.nextSibling);
            }

            parent.after(part2Span);
            parent.after(contentSpan);

            if (!parent.textContent) parent.remove();
            if (!part2Span.textContent) part2Span.remove();
            return true;
        }
        return false;
    }

    /* --- File & Drag/Drop Module --- */
    function readFileContent(file, callback) {
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 1MB`);
            return;
        }

        // Check for common non-text types (Media, PDF, Archives)
        const isMedia = file.type.startsWith('image/') ||
            file.type.startsWith('video/') ||
            file.type.startsWith('audio/') ||
            file.type === 'application/pdf' ||
            file.type === 'application/zip';

        if (isMedia) {
            showToast('Only text format files are allowed.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            callback(e.target.result);
            processText();
        };
        reader.readAsText(file);
    }

    function handleFileUpload(inputElement, textAreaElement, nameDisplayElement) {
        const file = inputElement.files[0];
        if (!file) return;
        readFileContent(file, (text) => {
            if (nameDisplayElement) nameDisplayElement.textContent = file.name;
            textAreaElement.value = text;
            inputElement.value = '';
            if (textAreaElement === EL.keywordsInput) {
                STATE.isKeywordsDirty = true;
                setTimeout(syncBackdrop, 0);
            }
        });
    }

    /* --- Syntax Highlighting Module --- */
    function syncBackdrop() {
        if (!EL.keywordsBackdrop || !EL.keywordsInput) return;

        const text = EL.keywordsInput.value;
        const lines = text.split('\n');

        const stylizedLines = lines.map(line => {
            if (line.trim().startsWith('//')) {
                return `<span class="comment">${escapeHtml(line)}</span>`;
            }
            return escapeHtml(line);
        });

        let html = stylizedLines.join('\n');
        if (text.endsWith('\n')) html += '<br>';

        EL.keywordsBackdrop.innerHTML = html;
        EL.keywordsBackdrop.scrollTop = EL.keywordsInput.scrollTop;
        EL.keywordsBackdrop.scrollLeft = EL.keywordsInput.scrollLeft;
    }

    function initSyntaxHighlighting() {
        if (!EL.keywordsBackdrop || !EL.keywordsInput) return;

        // Initial Sync
        syncBackdrop();

        // Use ResizeObserver to keep backdrop width in sync with textarea
        // This fixes misalignment when the vertical scrollbar appears/disappears
        const resizeObserver = new ResizeObserver(() => {
            EL.keywordsBackdrop.style.width = `${EL.keywordsInput.clientWidth}px`;
        });
        resizeObserver.observe(EL.keywordsInput);
    }

    function initDragAndDrop() {
        const targets = [
            { wrapper: EL.sourceInput.closest('.input-wrapper'), textarea: EL.sourceInput, nameDisplay: EL.fileNameSource },
            { wrapper: EL.keywordsInput.closest('.input-wrapper'), textarea: EL.keywordsInput, nameDisplay: EL.fileNameKeywords }
        ];

        targets.forEach(({ wrapper, textarea, nameDisplay }) => {
            if (!wrapper) return;
            let dragCounter = 0;
            const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
            events.forEach(evt => wrapper.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }));

            wrapper.addEventListener('dragenter', () => {
                dragCounter++;
                wrapper.classList.add('drag-active');
            });
            wrapper.addEventListener('dragleave', () => {
                dragCounter--;
                if (dragCounter === 0) wrapper.classList.remove('drag-active');
            });
            wrapper.addEventListener('drop', (e) => {
                dragCounter = 0;
                wrapper.classList.remove('drag-active');
                if (e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    readFileContent(file, (text) => {
                        if (nameDisplay) nameDisplay.textContent = file.name;
                        textarea.value = text;
                        if (textarea === EL.keywordsInput) {
                            STATE.isKeywordsDirty = true;
                            setTimeout(syncBackdrop, 0);
                        }
                    });
                }
            });
        });
    }


    /* ==========================================================================
       6. Event Listeners & Initialization
       ========================================================================== */

    // --- Input & Upload Events ---
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

    // Initialize backdrop and sync width
    initSyntaxHighlighting();

    if (EL.uploadSource) EL.uploadSource.addEventListener('change', () => handleFileUpload(EL.uploadSource, EL.sourceInput, EL.fileNameSource));
    if (EL.uploadKeywords) EL.uploadKeywords.addEventListener('change', () => handleFileUpload(EL.uploadKeywords, EL.keywordsInput, EL.fileNameKeywords));

    // --- Toolbar Buttons ---
    EL.btnTheme.addEventListener('click', toggleTheme);
    EL.btnFontInc.addEventListener('click', () => {
        if (STATE.fontSize < 24) { STATE.fontSize++; updateFontSize(); }
    });
    EL.btnFontDec.addEventListener('click', () => {
        if (STATE.fontSize > 8) { STATE.fontSize--; updateFontSize(); }
    });

    if (EL.btnRegexToggle) {
        EL.btnRegexToggle.addEventListener('click', () => {
            STATE.isRegexMode = !STATE.isRegexMode;
            EL.btnRegexToggle.classList.toggle('active', STATE.isRegexMode);
            STATE.isKeywordsDirty = true;
            processText();
        });
    }

    if (EL.btnSyncToggle) {
        EL.btnSyncToggle.addEventListener('click', () => {
            STATE.isSynced = !STATE.isSynced;

            if (STATE.isSynced) {
                // Return to Search Mode
                EL.outputDiv.setAttribute('contenteditable', 'false');
                EL.outputDiv.style.outline = 'none';
                EL.btnSyncToggle.innerHTML = '<i data-lucide="link"></i>';
                EL.btnSyncToggle.title = "Unlink to Edit Result";
                EL.btnSyncToggle.classList.remove('active');
                processText();
            } else {
                // Enter Manual Edit Mode
                EL.outputDiv.setAttribute('contenteditable', 'true');
                EL.outputDiv.focus();
                EL.btnSyncToggle.classList.add('active');
                EL.btnSyncToggle.innerHTML = '<i data-lucide="unlink"></i>';
                EL.btnSyncToggle.title = "Relink to Sync (Resets Changes)";

                // Init History
                STATE.history.stack = [{ content: EL.outputDiv.innerHTML, cursor: 0 }];
                STATE.history.pointer = 0;
            }
            if (window.lucide) window.lucide.createIcons();
        });
    }

    // --- Export Actions ---
    if (EL.btnCopyResult) {
        EL.btnCopyResult.addEventListener('click', () => {
            if (!EL.outputDiv.textContent) return;
            const textToCopy = EL.outputDiv.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('Copied to clipboard!', 'success');
                const originalIcon = EL.btnCopyResult.innerHTML;
                EL.btnCopyResult.innerHTML = '<i data-lucide="check"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    EL.btnCopyResult.innerHTML = originalIcon;
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            }).catch(() => showToast('Failed to copy.', 'error'));
        });
    }

    if (EL.btnCopySource) {
        EL.btnCopySource.addEventListener('click', () => {
            if (!EL.sourceInput.value) return;
            navigator.clipboard.writeText(EL.sourceInput.value).then(() => {
                showToast('Copied to clipboard!', 'success');
                const originalIcon = EL.btnCopySource.innerHTML;
                EL.btnCopySource.innerHTML = '<i data-lucide="check"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    EL.btnCopySource.innerHTML = originalIcon;
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            }).catch(() => showToast('Failed to copy.', 'error'));
        });
    }

    if (EL.btnDownloadResult) {
        EL.btnDownloadResult.addEventListener('click', () => {
            if (!EL.outputDiv.textContent) return;
            const textToSave = EL.outputDiv.innerText;
            const blob = new Blob([textToSave], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const timestamp = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

            let baseName = 'result';
            if (EL.fileNameSource.textContent) {
                const s = EL.fileNameSource.textContent;
                baseName = s.includes('.') ? s.substring(0, s.lastIndexOf('.')) : s;
            }

            a.download = `TMS-${baseName}_${timestamp}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Download started', 'success');
        });
    }

    // --- Manual Editing Events ---
    EL.outputDiv.addEventListener('compositionend', (e) => {
        if (!STATE.isSynced && e.data) wrapLastChars(e.data.length);
    });

    EL.outputDiv.addEventListener('input', (e) => {
        if (STATE.isSynced) return;
        debouncedSaveHistory();
        if (e.isComposing) return;
        if (e.inputType === 'insertText' && e.data) wrapLastChars(e.data.length);
        updateActionButtonsState();
    });


    EL.outputDiv.addEventListener('keydown', (e) => {
        if (STATE.isSynced) return;

        // Undo: Ctrl+Z
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            performUndo();
            return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            performRedo();
            return;
        }

        // Enter: Insert newline, split styled span if needed
        if (e.key === 'Enter') {
            e.preventDefault();
            saveHistorySnapshot();

            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();

            const newlineSpan = document.createElement('span');
            newlineSpan.className = 'diff-user';
            newlineSpan.textContent = '\n';

            if (!splitAndInsert(range, newlineSpan)) {
                range.insertNode(newlineSpan);
            }

            const newRange = document.createRange();
            newRange.setStartAfter(newlineSpan);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);

            debouncedSaveHistory();
            updateActionButtonsState();
        }
    });

    EL.outputDiv.addEventListener('paste', (e) => {
        if (STATE.isSynced) return;
        e.preventDefault();

        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text) return;

        saveHistorySnapshot();

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();

        const pasteSpan = document.createElement('span');
        pasteSpan.className = 'diff-user';
        pasteSpan.textContent = text;

        if (!splitAndInsert(range, pasteSpan)) {
            range.insertNode(pasteSpan);
        }

        const newRange = document.createRange();
        newRange.setStartAfter(pasteSpan);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        saveHistorySnapshot();
        updateActionButtonsState();
    });

    // --- Final Init ---
    initDragAndDrop();
    processText();

});
