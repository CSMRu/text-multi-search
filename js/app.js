/**
 * Text Multi Search - Main Application Logic
 * Handles search algorithm, UI interactions, and state management.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const EL = {
        sourceInput: document.getElementById('text-source'),
        keywordsInput: document.getElementById('text-keywords'),
        outputDiv: document.getElementById('search-output'),

        btnTheme: document.getElementById('btn-theme'),
        btnFontInc: document.getElementById('font-increase'),
        btnFontDec: document.getElementById('font-decrease'),
        fontSizeDisplay: document.getElementById('font-size-display'),

        btnSyncToggle: document.getElementById('btn-sync-toggle'),
        btnRegexToggle: document.getElementById('btn-regex-toggle'),
        btnCopyResult: document.getElementById('btn-copy-result'),

        uploadSource: document.getElementById('upload-source'),
        fileNameSource: document.getElementById('file-name-source'),
        uploadKeywords: document.getElementById('upload-keywords'),
        fileNameKeywords: document.getElementById('file-name-keywords'),

        countMatch: document.getElementById('count-match'),
        countReplace: document.getElementById('count-replace')
    };

    // --- State Management ---
    const STATE = {
        fontSize: 12,        // Current font size in pt
        isSynced: true,      // True if searching, False if editing manually
        isRegexMode: false,  // True if /regex/ patterns are enabled

        // Caching for Performance
        cachedMatchers: null,
        isKeywordsDirty: true,
        debounceTimer: null
    };

    // --- Utility Functions ---

    // HTML Special Character Escaping Map
    const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

    // Efficiently escape HTML characters to prevent XSS and rendering issues
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
    }

    // Escape special regex characters for literal string matching
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Debounce function to prevent excessive processing during typing
    function requestUpdate() {
        if (STATE.debounceTimer) clearTimeout(STATE.debounceTimer);
        STATE.debounceTimer = setTimeout(() => {
            processText();
        }, 150); // 150ms delay
    }

    // Toast notification utility
    function showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Select appropriate icon based on type
        const iconMap = {
            error: 'alert-circle',
            success: 'check-circle',
            info: 'info'
        };
        const icon = iconMap[type] || 'alert-circle';

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon"><i data-lucide="${icon}"></i></span>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- Core Logic: Search & Diff ---

    // Parse keywords input and compile Regex objects
    function buildMatchers(keywordsValue) {
        const lines = keywordsValue.split('\n');
        const matchers = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Ignore comment lines
            if (trimmed.startsWith('//')) return;

            let search = trimmed;
            let replace = trimmed;
            let isReplacement = false;

            // Handle replacement syntax: search // replace
            // We use ' // ' (with spaces) to prevent breaking URLs like https://
            if (trimmed.includes(' // ')) {
                const parts = trimmed.split(' // ');
                if (parts.length >= 2) {
                    search = parts[0].trim();
                    replace = parts[1].trim();
                    isReplacement = true;
                }
            }

            if (!search) return;

            let regex;
            try {
                // Case 1: [num] Wildcard (Always active)
                if (search === '[num]') {
                    regex = /\d+/g;
                }
                // Case 2: Explicit Regex /pattern/ (If mode enabled)
                else if (STATE.isRegexMode && search.startsWith('/') && search.endsWith('/') && search.length > 2) {
                    regex = new RegExp(search.slice(1, -1), 'g');
                }
                // Case 3: Literal String Match
                else {
                    regex = new RegExp(escapeRegExp(search), 'g');
                }
                matchers.push({ regex, searchStr: search, replace, isReplacement });
            } catch (e) {
                console.warn("Invalid Regex:", search, e);
            }
        });
        return matchers;
    }

    // Main Text Processing Function (Optimized)
    function processText() {
        if (!STATE.isSynced) return;

        const sourceText = EL.sourceInput.value;
        const keywordsValue = EL.keywordsInput.value;

        // Rebuild matchers only if keywords changed
        if (STATE.isKeywordsDirty) {
            STATE.cachedMatchers = buildMatchers(keywordsValue);
            STATE.isKeywordsDirty = false;
        }

        const matchers = STATE.cachedMatchers;

        // Handle empty cases - IMPORTANT: Wrap empty or unmatched text in diff-original
        // to ensure it keeps correct color in edit mode
        if (!sourceText) {
            EL.outputDiv.innerHTML = '';
            EL.countMatch.textContent = '0';
            EL.countReplace.textContent = '0';
            return;
        }

        if (matchers.length === 0) {
            EL.outputDiv.innerHTML = `<span class="diff-original">${escapeHtml(sourceText)}</span>`;
            EL.countMatch.textContent = '0';
            EL.countReplace.textContent = '0';
            return;
        }

        let cursor = 0;
        let countM = 0;
        let countR = 0;
        const resultParts = []; // Use Array buffer for performance

        // Reset Regex State
        matchers.forEach(m => m.regex.lastIndex = 0);

        // Cache next match results to minimize .exec() calls
        const nextMatches = new Array(matchers.length).fill(undefined);

        // Jump-Scanning Loop
        while (cursor < sourceText.length) {
            let bestMatcherIndex = -1;
            let minIndex = Infinity;
            let bestLen = 0;

            // Find earliest match among all keywords
            for (let i = 0; i < matchers.length; i++) {
                const m = matchers[i];
                let match = nextMatches[i];

                // Refresh match if invalid or stale (behind cursor)
                if (match === undefined || (match && match.index < cursor)) {
                    m.regex.lastIndex = cursor;
                    const res = m.regex.exec(sourceText);
                    if (res) {
                        nextMatches[i] = { index: res.index, text: res[0], len: res[0].length };
                    } else {
                        nextMatches[i] = null; // No more matches for this keyword
                    }
                    match = nextMatches[i];
                }

                // Identify the "winner" match (earliest index, then longest length)
                if (match) {
                    if (match.index < minIndex) {
                        minIndex = match.index;
                        bestLen = match.len;
                        bestMatcherIndex = i;
                    } else if (match.index === minIndex) {
                        if (match.len > bestLen) {
                            bestLen = match.len;
                            bestMatcherIndex = i;
                        }
                    }
                }
            }

            // No more matches found
            if (bestMatcherIndex === -1) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor))}</span>`);
                break;
            }

            // Append non-matching text before the match
            if (minIndex > cursor) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);
            }

            // Append the Match (Add or Replace style)
            const bestM = matchers[bestMatcherIndex];
            const bestMatchData = nextMatches[bestMatcherIndex];

            const className = bestM.isReplacement ? 'diff-replace' : 'diff-add';
            const displayContent = bestM.isReplacement ? bestM.replace : bestMatchData.text;

            if (bestM.isReplacement) countR++;
            else countM++;

            resultParts.push(`<span class="${className}">${escapeHtml(displayContent)}</span>`);

            // Advance Cursor
            const nextCursor = minIndex + bestMatchData.len;
            if (nextCursor === cursor) {
                // Zero-width match: We must manually advance cursor to prevent infinite loop.
                // IMPORTANT: We must NOT lose the character we are stepping over.
                // Since we determined the best match here is length 0, it means no non-empty match started here.
                // So this character is "original" text.
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
    }

    // --- Feature Logic: UI & Editing ---

    // Wraps user input in blue spans when editing manually.
    // Preserves the cursor position after wrapping.
    function wrapLastChars(length) {
        if (!length) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType !== Node.TEXT_NODE) return;
        const parent = node.parentElement;
        if (!parent || !EL.outputDiv.contains(parent)) return;

        // Only wrap if currently in a non-blue class (original, add, replace)
        if (parent.classList.contains('diff-original') ||
            parent.classList.contains('diff-add') ||
            parent.classList.contains('diff-replace')) {

            const endOffset = range.startOffset;
            const startOffset = endOffset - length;
            if (startOffset < 0) return;

            try {
                const newRange = document.createRange();
                newRange.setStart(node, startOffset);
                newRange.setEnd(node, endOffset);

                const span = document.createElement('span');
                span.className = 'diff-gap'; // Blue text class

                newRange.surroundContents(span);

                // Move cursor to end of new span
                const cursorRange = document.createRange();
                cursorRange.selectNodeContents(span);
                cursorRange.collapse(false);
                sel.removeAllRanges();
                sel.addRange(cursorRange);
            } catch (e) {
                console.error("Wrap failed", e);
            }
        }
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

    function updateFontSize() {
        EL.fontSizeDisplay.textContent = `${STATE.fontSize}pt`;
        // Convert pt to px approximate (1pt = 1.333px)
        const sizePx = STATE.fontSize * 1.333;
        document.documentElement.style.setProperty('--font-size-base', `${sizePx}px`);
    }

    // --- Feature Logic: Files & Clipboard ---

    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB limit

    function readFileContent(file, callback) {
        // Check file size limit
        if (file.size > MAX_FILE_SIZE) {
            showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 2MB`);
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
            // Only update UI after successful file read
            if (nameDisplayElement) nameDisplayElement.textContent = file.name;
            textAreaElement.value = text;
            inputElement.value = ''; // Reset input
            if (textAreaElement === EL.keywordsInput) STATE.isKeywordsDirty = true;
        });
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
                        // Only update UI after successful file read
                        if (nameDisplay) nameDisplay.textContent = file.name;
                        textarea.value = text;
                        if (textarea === EL.keywordsInput) STATE.isKeywordsDirty = true;
                    });
                }
            });
        });
    }

    // --- Event Listeners ---

    // Input Events
    EL.sourceInput.addEventListener('input', requestUpdate);
    EL.keywordsInput.addEventListener('input', () => {
        STATE.isKeywordsDirty = true;
        requestUpdate();
    });

    // Theme & Font Controls
    EL.btnTheme.addEventListener('click', toggleTheme);
    EL.btnFontInc.addEventListener('click', () => {
        if (STATE.fontSize < 24) { STATE.fontSize++; updateFontSize(); }
    });
    EL.btnFontDec.addEventListener('click', () => {
        if (STATE.fontSize > 8) { STATE.fontSize--; updateFontSize(); }
    });

    // Regex Toggle
    if (EL.btnRegexToggle) {
        EL.btnRegexToggle.addEventListener('click', () => {
            STATE.isRegexMode = !STATE.isRegexMode;
            EL.btnRegexToggle.classList.toggle('active', STATE.isRegexMode);
            STATE.isKeywordsDirty = true;
            processText();
        });
    }

    // Sync/Unlink Toggle
    if (EL.btnSyncToggle) {
        EL.btnSyncToggle.addEventListener('click', () => {
            STATE.isSynced = !STATE.isSynced;

            if (STATE.isSynced) {
                // Mode: Search (Read-only)
                EL.outputDiv.setAttribute('contenteditable', 'false');
                EL.outputDiv.style.outline = 'none';
                EL.btnSyncToggle.innerHTML = '<i data-lucide="link"></i>';
                EL.btnSyncToggle.title = "Unlink to Edit Result";
                EL.btnSyncToggle.classList.remove('active');
                // Re-run search
                processText();
            } else {
                // Mode: Edit (Manual)
                EL.outputDiv.setAttribute('contenteditable', 'true');
                EL.outputDiv.focus();
                EL.btnSyncToggle.classList.add('active');
                EL.btnSyncToggle.innerHTML = '<i data-lucide="link-2-off"></i>';
                EL.btnSyncToggle.title = "Relink to Sync (Resets Changes)";

                // Insert invisible buffers to allow cursor formatting safe-guards
                const spans = EL.outputDiv.querySelectorAll('.diff-add, .diff-replace, .diff-original');
                spans.forEach(span => {
                    // Start guard
                    if (!span.previousSibling?.classList?.contains('diff-gap')) {
                        const gap = document.createElement('span');
                        gap.className = 'diff-gap';
                        gap.textContent = '\u200B';
                        span.before(gap);
                    }
                    // End guard
                    if (!span.nextSibling?.classList?.contains('diff-gap')) {
                        const gap = document.createElement('span');
                        gap.className = 'diff-gap';
                        gap.textContent = '\u200B';
                        span.after(gap);
                    }
                });
            }
            if (window.lucide) window.lucide.createIcons();
        });
    }

    // Copy Button
    if (EL.btnCopyResult) {
        EL.btnCopyResult.addEventListener('click', () => {
            if (!EL.outputDiv.textContent) return;

            // Get text and strip Zero Width Spaces (\u200B) used for formatting
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
            }).catch(() => {
                showToast('Failed to copy. Check browser permissions.', 'error');
            });
        });
    }

    // File Uploads
    if (EL.uploadSource) EL.uploadSource.addEventListener('change', () => handleFileUpload(EL.uploadSource, EL.sourceInput, EL.fileNameSource));
    if (EL.uploadKeywords) EL.uploadKeywords.addEventListener('change', () => handleFileUpload(EL.uploadKeywords, EL.keywordsInput, EL.fileNameKeywords));

    // Edit Mode Input Handling (Coloring)
    EL.outputDiv.addEventListener('compositionend', (e) => {
        if (!STATE.isSynced && e.data) wrapLastChars(e.data.length);
    });
    EL.outputDiv.addEventListener('input', (e) => {
        if (STATE.isSynced) return;
        if (e.isComposing) return;
        if (e.inputType === 'insertText' && e.data) wrapLastChars(e.data.length);
    });

    // Gap Cursor Managment
    document.addEventListener('selectionchange', () => {
        if (STATE.isSynced) return;
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const node = sel.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        const parent = node.parentElement;
        if (!parent || !EL.outputDiv.contains(parent)) return;

        // If cursor lands inside a formatted block (original/add/replace), try to push it to a gap
        // This is a subtle UX feel improvement to encourage typing in the gap
        if (parent.classList.contains('diff-add') || parent.classList.contains('diff-replace') || parent.classList.contains('diff-original')) {
            if (sel.anchorOffset === node.length && parent.nextSibling?.classList?.contains('diff-gap')) {
                // At end -> Move to next gap
                const r = document.createRange();
                r.selectNodeContents(parent.nextSibling);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
            } else if (sel.anchorOffset === 0 && parent.previousSibling?.classList?.contains('diff-gap')) {
                // At start -> Move to previous gap
                const r = document.createRange();
                r.selectNodeContents(parent.previousSibling);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
            }
        }
    });

    // Initialize Features
    initDragAndDrop();

    // Initial Process
    processText();
});
