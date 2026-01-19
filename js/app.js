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
        if (!EL.btnDownloadResult) return;
        const hasText = EL.outputDiv.textContent.trim().length > 0;

        const setBtnState = (btn) => {
            if (btn) {
                btn.disabled = !hasText;
                btn.style.opacity = hasText ? '1' : '0.5';
                btn.style.pointerEvents = hasText ? 'auto' : 'none';
            }
        };

        setBtnState(EL.btnDownloadResult);
        setBtnState(EL.btnCopyResult);
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

    /* --- Editor Handling Module --- */
    function wrapLastChars(length) {
        if (!length) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType !== Node.TEXT_NODE) return;
        const parent = node.parentElement;
        if (!parent || !EL.outputDiv.contains(parent)) return;

        if (parent.classList.contains('diff-original') ||
            parent.classList.contains('diff-add') ||
            parent.classList.contains('diff-replace')) {

            const endOffset = range.startOffset;
            const startOffset = endOffset - length;
            if (startOffset < 0) return;

            try {
                // Split Parent Logic to prevent nested styles
                const textNode = node;
                const textToWrap = textNode.splitText(startOffset);
                const textAfter = textToWrap.splitText(length);

                const parentClone = parent.cloneNode(false);

                // Move textAfter and any subsequent siblings to clone
                parentClone.appendChild(textAfter);
                while (textAfter.nextSibling) {
                    parentClone.appendChild(textAfter.nextSibling);
                }

                const newSpan = document.createElement('span');
                newSpan.className = 'diff-gap';
                newSpan.appendChild(textToWrap);

                // Insert into DOM: Parent -> NewSpan -> ParentClone
                parent.after(parentClone);
                parent.after(newSpan);

                // Cleanup empty styled spans
                if (!parent.textContent) parent.remove();
                if (!parentClone.textContent) parentClone.remove();

                // Restore Cursor
                const cursorRange = document.createRange();
                cursorRange.selectNodeContents(newSpan);
                cursorRange.collapse(false);
                sel.removeAllRanges();
                sel.addRange(cursorRange);
            } catch (e) {
                console.error("Wrap failed", e);
            }
        }
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
                // Defer to ensure DOM update if needed, though value set is sync
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
            // Check for comment start (starts with //), but render the full line including whitespace
            if (line.trim().startsWith('//')) {
                return `<span class="comment">${escapeHtml(line)}</span>`;
            }
            return escapeHtml(line);
        });

        // specific fix for trailing newlines in pre-wrap div
        let html = stylizedLines.join('\n');
        if (text.endsWith('\n')) {
            html += '<br>';
        }

        EL.keywordsBackdrop.innerHTML = html;

        // Sync scroll immediately (e.g. paste)
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
    if (EL.uploadKeywords) EL.uploadKeywords.addEventListener('change', () => {
        handleFileUpload(EL.uploadKeywords, EL.keywordsInput, EL.fileNameKeywords);
        // We need to wait for file read to complete. 
        // handleFileUpload uses a callback but doesn't expose it here easily.
        // However, handleFileUpload sets value then triggers... wait, it doesn't trigger input event automatically unless dispatched.
        // It sets value directly: textAreaElement.value = text;
        // In handleFileUpload, we should trigger sync. Let's patch handleFileUpload instead of here?
        // Or just observe mutation? No.
        // Let's modify handleFileUpload instead or just rely on the fact that handleFileUpload modifies the element.
        // Actually, looking at handleFileUpload logic:
        // inner: callback(e.target.result);
        // callback: textAreaElement.value = text;
        // It does NOT dispatch input event.
        // So I also need to update handleFileUpload to call syncBackdrop if it's the keywords input.
    });

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

                // Add guards
                const spans = EL.outputDiv.querySelectorAll('.diff-add, .diff-replace, .diff-original');
                spans.forEach(span => {
                    const mkGap = () => {
                        const gap = document.createElement('span');
                        gap.className = 'diff-gap';
                        gap.textContent = '\u200B';
                        return gap;
                    };
                    if (!span.previousSibling?.classList?.contains('diff-gap')) span.before(mkGap());
                    if (!span.nextSibling?.classList?.contains('diff-gap')) span.after(mkGap());
                });

                // Init History (After guards are added)
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
            const textToCopy = EL.outputDiv.innerText.replace(/\u200B/g, '');
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

    if (EL.btnDownloadResult) {
        EL.btnDownloadResult.addEventListener('click', () => {
            if (!EL.outputDiv.textContent) return;
            const textToSave = EL.outputDiv.innerText.replace(/\u200B/g, '');
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
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); performUndo(); }
        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); performRedo(); }

        // Smart Navigation: Skip Zero-Width Spaces (\u200B) for Arrow Keys
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const sel = window.getSelection();
            if (sel.rangeCount === 0) return;

            const direction = e.key === 'ArrowLeft' ? 'backward' : 'forward';

            // Save state to restore if needed
            const anchorNode = sel.anchorNode;
            const anchorOffset = sel.anchorOffset;
            const focusNode = sel.focusNode;
            const focusOffset = sel.focusOffset;
            const isCollapsed = sel.isCollapsed;

            try {
                // Peek by extending selection 1 character
                sel.modify('extend', direction, 'character');
                const text = sel.toString();

                if (text === '\u200B') {
                    e.preventDefault();
                    sel.modify('move', direction, 'character');
                } else {
                    // Restore original selection
                    sel.collapse(anchorNode, anchorOffset);
                    if (!isCollapsed) {
                        sel.extend(focusNode, focusOffset);
                    }
                }
            } catch (err) {
                console.warn("Arrow nav fallback", err);
                try {
                    sel.collapse(anchorNode, anchorOffset);
                    if (!isCollapsed) sel.extend(focusNode, focusOffset);
                } catch (e) { }
            }
        }

        // Smart Backspace: Skip Zero-Width Spaces (\u200B)
        if (e.key === 'Backspace') {
            const sel = window.getSelection();
            if (sel.isCollapsed && sel.rangeCount > 0) {
                const originalRange = sel.getRangeAt(0).cloneRange();
                try {
                    sel.modify('extend', 'backward', 'character');
                    const text = sel.toString();

                    if (text === '\u200B') {
                        sel.modify('extend', 'backward', 'character');
                        const range = sel.getRangeAt(0);

                        // Check container before delete (to know what to cleanup)
                        const container = range.startContainer;
                        const parent = container.parentElement;

                        range.deleteContents();
                        e.preventDefault();

                        // Cleanup Empty Styled Spans
                        if (parent && (parent.classList.contains('diff-add') || parent.classList.contains('diff-replace') || parent.classList.contains('diff-original')) && !parent.textContent) {
                            const prev = parent.previousSibling;
                            const next = parent.nextSibling;
                            const container = parent.parentElement;

                            parent.remove();

                            // Prefer prev, then next
                            let target = prev || next;
                            let collapseToStart = !prev; // if prev exists, collapse to end (false). if only next exists, start (true).

                            if (!target) {
                                // No siblings, create a new gap
                                target = document.createElement('span');
                                target.className = 'diff-gap';
                                target.textContent = '\u200B';
                                container.appendChild(target);
                                collapseToStart = false;
                            }

                            const r = document.createRange();
                            r.selectNodeContents(target);
                            r.collapse(collapseToStart);
                            sel.removeAllRanges();
                            sel.addRange(r);
                        }

                        debouncedSaveHistory();
                        updateActionButtonsState();
                    } else {
                        sel.removeAllRanges();
                        sel.addRange(originalRange);
                    }
                } catch (err) {
                    sel.removeAllRanges();
                    sel.addRange(originalRange);
                }
            }
        }

        // Smart Delete (Forward): Skip Zero-Width Spaces (\u200B)
        if (e.key === 'Delete') {
            const sel = window.getSelection();
            if (sel.isCollapsed && sel.rangeCount > 0) {
                const originalRange = sel.getRangeAt(0).cloneRange();
                try {
                    sel.modify('extend', 'forward', 'character');
                    const text = sel.toString();

                    if (text === '\u200B') {
                        sel.modify('extend', 'forward', 'character');
                        const range = sel.getRangeAt(0);

                        const container = range.startContainer;
                        const parent = container.parentElement;

                        range.deleteContents();
                        e.preventDefault();

                        // Cleanup Empty Styled Spans
                        if (parent && (parent.classList.contains('diff-add') || parent.classList.contains('diff-replace') || parent.classList.contains('diff-original')) && !parent.textContent) {
                            const prev = parent.previousSibling;
                            const next = parent.nextSibling;
                            const container = parent.parentElement;

                            parent.remove();

                            // For Delete (forward), prefer Next, then Prev
                            let target = next || prev;
                            let collapseToStart = !!next; // if next exists, start (true). if only prev, end (false).

                            if (!target) {
                                target = document.createElement('span');
                                target.className = 'diff-gap';
                                target.textContent = '\u200B';
                                container.appendChild(target);
                                collapseToStart = false;
                            }

                            const r = document.createRange();
                            r.selectNodeContents(target);
                            r.collapse(collapseToStart);
                            sel.removeAllRanges();
                            sel.addRange(r);
                        }

                        debouncedSaveHistory();
                        updateActionButtonsState();
                    } else {
                        sel.removeAllRanges();
                        sel.addRange(originalRange);
                    }
                } catch (err) {
                    sel.removeAllRanges();
                    sel.addRange(originalRange);
                }
            }
        }

        // Smart Enter: Split styled span to prevent inheritance & insert newline
        if (e.key === 'Enter') {
            e.preventDefault();
            saveHistorySnapshot();

            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents(); // delete selection if any

            const anchor = range.startContainer;
            const parent = anchor.parentElement;

            // Re-use splitting logic if inside styled span
            if (anchor.nodeType === Node.TEXT_NODE &&
                (parent.classList.contains('diff-add') ||
                    parent.classList.contains('diff-replace') ||
                    parent.classList.contains('diff-original'))) {

                try {
                    const latterTextNode = anchor.splitText(range.startOffset);
                    const part2Span = parent.cloneNode(false);
                    part2Span.appendChild(latterTextNode);
                    while (latterTextNode.nextSibling) {
                        part2Span.appendChild(latterTextNode.nextSibling);
                    }

                    parent.after(part2Span);

                    // Insert newline in a gap span
                    const span = document.createElement('span');
                    span.className = 'diff-gap';
                    span.textContent = '\n';
                    parent.after(span);

                    if (!parent.textContent) parent.remove();
                    if (!part2Span.textContent) part2Span.remove();

                    // Cursor placement
                    const newRange = document.createRange();
                    newRange.setStartAfter(span);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);

                } catch (err) {
                    console.error("Enter split failed", err);
                }
            } else {
                // Normal enter
                const span = document.createElement('span');
                span.className = 'diff-gap';
                span.textContent = '\n';
                range.insertNode(span);
                range.setStartAfter(span);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
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
        let range = sel.getRangeAt(0);
        range.deleteContents(); // Clear selection first

        // Create the blue span for new text
        const span = document.createElement('span');
        span.className = 'diff-gap';
        span.textContent = text;

        // Check if we are inserting INSIDE a styled span (add/replace/original)
        // If so, we must split the parent span to prevent style inheritance (CSS !important issues)
        const anchor = range.startContainer;
        const parent = anchor.parentElement;

        if (anchor.nodeType === Node.TEXT_NODE &&
            (parent.classList.contains('diff-add') ||
                parent.classList.contains('diff-replace') ||
                parent.classList.contains('diff-original'))) {

            // Strategy: Split text -> [Part1] [NewSpan] [Part2] -> Insert
            const latterTextNode = anchor.splitText(range.startOffset);

            const part2Span = parent.cloneNode(false);
            part2Span.appendChild(latterTextNode);

            // Move siblings to new span
            while (latterTextNode.nextSibling) {
                part2Span.appendChild(latterTextNode.nextSibling);
            }

            parent.after(part2Span);
            parent.after(span);

            // Cleanup empty spans if split happened at edges
            if (parent.textContent.length === 0) parent.remove();
            if (part2Span.textContent.length === 0) part2Span.remove();

        } else {
            // Normal insertion (already in gap or root)
            range.insertNode(span);
        }

        // Move cursor to end of new span
        range = document.createRange();
        range.setStartAfter(span);
        range.setEndAfter(span);
        sel.removeAllRanges();
        sel.addRange(range);

        saveHistorySnapshot();
        updateActionButtonsState();
    });

    // --- Final Init ---
    initDragAndDrop();
    processText();

});
