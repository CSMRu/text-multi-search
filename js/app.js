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

        // Controls
        btnTheme: document.getElementById('btn-theme'),
        btnFontInc: document.getElementById('font-increase'),
        btnFontDec: document.getElementById('font-decrease'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        btnSyncToggle: document.getElementById('btn-sync-toggle'),

        // Export Actions
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
        isKeywordsDirty: true, // Flag to rebuild matchers only when keywords change
        cachedMatchers: null,
        debounceTimer: null,
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

    function refreshIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    function requestUpdate() {
        if (STATE.debounceTimer) clearTimeout(STATE.debounceTimer);
        STATE.debounceTimer = setTimeout(processText, CONFIG.DEBOUNCE_DELAY);
    }

    function isStyledSpan(el) {
        return el && (
            el.classList.contains('diff-add') ||
            el.classList.contains('diff-replace') ||
            el.classList.contains('diff-original')
        );
    }

    // Calculates global character offset relative to container
    function getCursorOffset(container) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;

        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        return preCaretRange.toString().length;
    }

    // Set global cursor position by character offset
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

    /* ==========================================================================
       3. UI Component Functions
       ========================================================================== */

    function showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icon = { error: 'alert-circle', success: 'check-circle', info: 'info' }[type] || 'alert-circle';
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon"><i data-lucide="${icon}"></i></span><span>${message}</span>`;

        container.appendChild(toast);
        refreshIcons();

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

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

    function updateFontSize(delta) {
        if (delta) {
            STATE.fontSize = Math.max(8, Math.min(24, STATE.fontSize + delta));
        }
        EL.fontSizeDisplay.textContent = `${STATE.fontSize}pt`;
        document.documentElement.style.setProperty('--font-size-base', `${STATE.fontSize * 1.333}px`);
    }

    function toggleTheme() {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);

        if (EL.btnTheme) {
            EL.btnTheme.innerHTML = `<i data-lucide="${newTheme === 'dark' ? 'moon' : 'sun'}"></i>`;
            refreshIcons();
        }
    }

    /* ==========================================================================
       4. Core Logic (Search Platform)
       ========================================================================== */

    function buildMatchers(keywordsValue) {
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

                // Prepare Regex Pattern
                let pattern = escapeRegExp(search);

                // [or] Support
                pattern = pattern.replace(/\s*\\\[or\\\]\s*/g, '|');

                // Wildcard Support ([num], [cjk])
                const wildcardOrder = [];
                pattern = pattern.replace(/\\\[(num|cjk)\\\]/g, (match, type) => {
                    wildcardOrder.push(type);
                    if (type === 'num') return '(\\d+)';
                    if (type === 'cjk') return '([\u4E00-\u9FFF])';
                    return match;
                });

                if (isReplacement) {
                    // Safe Mode: Treat ALL '$' as literal '$$' unless strictly needed for capture groups
                    replacePattern = replace.replace(/\$(?!\d)/g, () => '$$$$');

                    // Restore functional capture groups for [num]/[cjk]
                    if (wildcardOrder.length > 0) {
                        let gIdx = 0;
                        replacePattern = replacePattern.replace(/\[(num|cjk)\]/g, (m, type) =>
                            (gIdx < wildcardOrder.length && wildcardOrder[gIdx] === type) ? `$${++gIdx}` : m
                        );
                    }
                }

                // Handle [line] token in replacement
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
    }

    /** Main search/replace engine */
    function processText() {
        if (!STATE.isSynced) return;

        const sourceText = EL.sourceInput.value;
        if (STATE.isKeywordsDirty) {
            STATE.cachedMatchers = buildMatchers(EL.keywordsInput.value);
            STATE.isKeywordsDirty = false;
        }

        const matchers = STATE.cachedMatchers;

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

        // Helper: Calculate replacement content (shared by Pass 1 & 2)
        const getDisplayContent = (matcher, matchData) => {
            if (!matcher.isReplacement) return matchData.text;

            // Replace $$LINE$$, $$, and $n with actual content
            return matcher.replacePattern.replace(/(\$\$LINE\$\$)|(\$\$)|(\$(\d+))/g, (match, lineToken, escDollar, capGroup, grpIdx) => {
                if (lineToken) {
                    return matchData.text.replace(/\r?\n$/, '');
                }
                if (escDollar) return '$';
                if (capGroup) {
                    const idx = parseInt(grpIdx, 10) - 1;
                    return (matchData.groups[idx] !== undefined) ? matchData.groups[idx] : '';
                }
                return match;
            });
        };

        // Pass 1: Pre-scan Priority Ranges ([line] mode)
        const priorityRanges = [];
        const lineMatchers = matchers.filter(m => m.isLineMode);

        if (lineMatchers.length > 0) {
            let lineRegex = /^[\s\S]*?(\r?\n|$)/gm;
            let lineMatch;

            while ((lineMatch = lineRegex.exec(sourceText)) !== null) {
                if (!lineMatch[0]) break; // EOF check

                for (let m of lineMatchers) {
                    m.regex.lastIndex = 0;
                    const res = m.regex.exec(lineMatch[0]);
                    if (res) {
                        priorityRanges.push({
                            start: lineMatch.index,
                            end: lineMatch.index + lineMatch[0].length,
                            matcher: m,
                            matchData: {
                                index: lineMatch.index,
                                text: lineMatch[0],
                                len: lineMatch[0].length,
                                groups: res.slice(1)
                            }
                        });
                        break; // First match wins for this line
                    }
                }
            }
        }

        // Pass 2: Main Scan (Text Mode)
        const textMatchers = matchers.filter(m => !m.isLineMode);
        textMatchers.forEach(m => m.regex.lastIndex = 0);

        const nextMatches = new Array(textMatchers.length).fill(undefined);
        let priorityIdx = 0;

        while (cursor < sourceText.length) {
            // Check Priority Range Overlap
            if (priorityIdx < priorityRanges.length) {
                const pRange = priorityRanges[priorityIdx];

                if (cursor === pRange.start) {
                    // Execute Priority Match
                    const content = getDisplayContent(pRange.matcher, pRange.matchData);
                    const cls = pRange.matcher.isReplacement ? 'diff-replace' : 'diff-add';

                    if (pRange.matcher.isReplacement) countR++; else countM++;
                    resultParts.push(`<span class="${cls}">${escapeHtml(content)}</span>`);

                    cursor = pRange.end;
                    priorityIdx++;
                    continue;
                }
            }

            // Limit search to next priority range
            let limit = (priorityIdx < priorityRanges.length) ? priorityRanges[priorityIdx].start : Infinity;
            let bestIdx = -1;
            let minIndex = Infinity;
            let bestLen = 0;

            // Find best text match
            for (let i = 0; i < textMatchers.length; i++) {
                const m = textMatchers[i];

                if (!nextMatches[i] || nextMatches[i].index < cursor) {
                    m.regex.lastIndex = cursor;
                    const res = m.regex.exec(sourceText);
                    nextMatches[i] = res ? { index: res.index, text: res[0], len: res[0].length, groups: res.slice(1) } : null;
                }

                const match = nextMatches[i];
                if (match) {
                    if (match.index >= limit || match.index + match.len > limit) continue; // Skip overlaps

                    if (match.index < minIndex || (match.index === minIndex && match.len > bestLen)) {
                        minIndex = match.index;
                        bestLen = match.len;
                        bestIdx = i;
                    }
                }
            }

            // No match found or match is beyond limit
            if (bestIdx === -1) {
                const nextTarget = (limit === Infinity) ? sourceText.length : limit;
                if (nextTarget > cursor) {
                    resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, nextTarget))}</span>`);
                }
                cursor = nextTarget;
                continue;
            }

            // Gap filling before match
            if (minIndex > cursor) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);
            }

            // Execute Text Match
            const bestM = textMatchers[bestIdx];
            const bestData = nextMatches[bestIdx];
            const content = getDisplayContent(bestM, bestData);
            const cls = bestM.isReplacement ? 'diff-replace' : 'diff-add';

            if (bestM.isReplacement) countR++; else countM++;
            resultParts.push(`<span class="${cls}">${escapeHtml(content)}</span>`);

            cursor = minIndex + bestData.len;
        }

        EL.outputDiv.innerHTML = resultParts.join('');
        EL.countMatch.textContent = countM;
        EL.countReplace.textContent = countR;
        updateActionButtonsState();
    }

    /* ==========================================================================
       5. Feature Modules
       ========================================================================== */

    /* --- History Module --- */
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

    const debouncedSaveHistory = () => {
        clearTimeout(STATE.history.timer);
        STATE.history.timer = setTimeout(saveHistorySnapshot, CONFIG.HISTORY_DEBOUNCE);
    };

    function performHistoryAction(isUndo) {
        if (isUndo ? STATE.history.pointer > 0 : STATE.history.pointer < STATE.history.stack.length - 1) {
            STATE.history.pointer += isUndo ? -1 : 1;
            const s = STATE.history.stack[STATE.history.pointer];
            EL.outputDiv.innerHTML = s.content;
            setCursorOffset(EL.outputDiv, s.cursor);
            updateActionButtonsState();
        }
    }

    /* --- Manual Edit Helper --- */
    function insertNodeAtCursor(node) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        range.deleteContents();

        // Split styled span if needed
        const anchor = range.startContainer;
        const parent = anchor.parentElement;

        if (anchor.nodeType === Node.TEXT_NODE && isStyledSpan(parent)) {
            const latter = anchor.splitText(range.startOffset);
            const part2 = parent.cloneNode(false);
            part2.appendChild(latter);

            while (latter.nextSibling) part2.appendChild(latter.nextSibling);

            parent.after(part2);
            parent.after(node);

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

    // Wrap newly typed chars (Manual Mode)
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

    /* --- File & Keywords --- */
    function readFileContent(file, callback) {
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            return showToast(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        }
        if (/^(image|video|audio|application\/(pdf|zip))/.test(file.type)) {
            return showToast('Only text files allowed');
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
                    setTimeout(syncBackdrop, 0);
                }
            });
        }
    }

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

    /* ==========================================================================
       6. Event Listeners
       ========================================================================== */

    const initSyntaxHighlighting = () => {
        syncBackdrop();
        new ResizeObserver(() => {
            EL.keywordsBackdrop.style.width = `${EL.keywordsInput.clientWidth}px`;
        }).observe(EL.keywordsInput);
    };

    const initDragAndDrop = () => {
        const handleDrop = (e, area, nameDisplay) => {
            e.preventDefault();
            e.target.closest('.input-wrapper')?.classList.remove('drag-active');

            if (e.dataTransfer.files[0]) {
                readFileContent(e.dataTransfer.files[0], txt => {
                    if (nameDisplay) nameDisplay.textContent = e.dataTransfer.files[0].name;
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
    };

    // --- Listeners Registration ---

    // Inputs
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

    // File Uploads
    if (EL.uploadSource) {
        EL.uploadSource.addEventListener('change', () => handleFileUpload(EL.uploadSource, EL.sourceInput, EL.fileNameSource));
    }
    if (EL.uploadKeywords) {
        EL.uploadKeywords.addEventListener('change', () => handleFileUpload(EL.uploadKeywords, EL.keywordsInput, EL.fileNameKeywords));
    }

    // UI Controls
    EL.btnTheme?.addEventListener('click', toggleTheme);
    EL.btnFontInc?.addEventListener('click', () => updateFontSize(1));
    EL.btnFontDec?.addEventListener('click', () => updateFontSize(-1));

    // Sync Toggle
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
            processText();
        } else {
            EL.outputDiv.focus();
            STATE.history.stack = [{ content: EL.outputDiv.innerHTML, cursor: 0 }];
            STATE.history.pointer = 0;
        }
        refreshIcons();
    });

    // Clipboard Actions
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
        const ts = now.toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '-'); // YYMMDD-HHMM

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

    // Manual Edit Events
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

        // Undo/Redo
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            performHistoryAction(true);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            performHistoryAction(false);
            return;
        }

        // Enter Key
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

    // Initialization
    initSyntaxHighlighting();
    initDragAndDrop();
    processText();
});
