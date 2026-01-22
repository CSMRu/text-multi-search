/**
 * Worker Manager Module
 * Handles Web Worker communication, fallback logic, and progressive rendering.
 */
window.TMS = window.TMS || {};

// Constants specific to Worker
const WORKER_CONFIG = {
    TIMEOUT_MS: 3000
};

TMS.WorkerManager = {
    worker: null,
    timer: null,
    currentId: 0,
    isLoading: false,
    useFallback: false,

    // =========================================================================
    // [1] Initialization & Scheduling
    // =========================================================================

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

    // =========================================================================
    // [2] Core Processing Logic (Public)
    // =========================================================================

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

    // =========================================================================
    // [3] Worker Communication (Internal)
    // =========================================================================

    postMessage(sourceText, keywordsValue) {
        // Aggressive Termination
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
                    const result = FallbackEngine.processText(sourceText, keywordsValue);
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
        const { id, status, html, htmlChunks, countM, countR, message } = e.data;
        if (id !== this.currentId) return;

        clearTimeout(this.timer);

        if (status === 'success') {
            TMS.EL.countMatch.textContent = countM;
            TMS.EL.countReplace.textContent = countR;
            TMS.EL.outputDiv.innerHTML = '';
            TMS.UIManager.updateActionButtonsState();

            if (htmlChunks && htmlChunks.length > 0) {
                this.renderChunks(htmlChunks, id);
            } else if (html) {
                TMS.EL.outputDiv.innerHTML = html;
                this.setLoading(false);
                TMS.UIManager.updateActionButtonsState();
            } else {
                this.setLoading(false);
                TMS.UIManager.updateActionButtonsState();
            }
        } else {
            this.setLoading(false);
            TMS.UIManager.showToast(message || 'Unknown Error', 'error');
        }
    },

    // =========================================================================
    // [4] Helpers & State Management
    // =========================================================================

    renderChunks(chunks, originId) {
        let index = 0;
        const total = chunks.length;

        const renderNext = () => {
            if (this.currentId !== originId) return;

            TMS.EL.outputDiv.insertAdjacentHTML('beforeend', chunks[index]);
            index++;

            if (index < total) {
                requestAnimationFrame(renderNext);
            } else {
                this.setLoading(false);
                TMS.UIManager.updateActionButtonsState();
            }
        };
        requestAnimationFrame(renderNext);
    },

    handleTimeout() {
        this.worker.terminate();
        this.worker = null;
        this.setLoading(false);
        TMS.UIManager.showToast('Search Timed Out (Too complex)', 'error');
        TMS.EL.outputDiv.innerHTML += '<div style="color:var(--diff-del-text); padding:1rem; font-weight:bold; border:1px solid var(--diff-del-text); margin-top:1rem;">⚠️ Calculation Timed Out. Please simplify your keywords.</div>';
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

/**
 * Fallback Engine: Runs on main thread when Web Workers are unavailable.
 * CAUTION: CRITICAL! Keep logic synced with js/worker.js.
 * This engine runs only when Web Workers are unavailable (e.g. file:// protocol).
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
            let isDel = false;

            const sepIndex = trimmed.indexOf('///');
            if (sepIndex !== -1) {
                search = trimmed.substring(0, sepIndex).trim();
                replace = trimmed.substring(sepIndex + 3).trim();
                if (replace === '[del]') {
                    replace = '';
                    isDel = true;
                }
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
                // Placeholder to protect [or] during regex escaping
                const ESCAPED_OR_PLACEHOLDER = '\uFFFF';
                let tempSearch = search.split('\\[or]').join(ESCAPED_OR_PLACEHOLDER);
                const segments = tempSearch.split(/\s*\[or\]\s*/);
                const wildcardOrder = [];
                const processedSegments = segments.filter(s => s.length > 0).map(s => {
                    let content = s.split(ESCAPED_OR_PLACEHOLDER).join('[or]');
                    let p = TMS.Utils.escapeRegExp(content); // Use TMS.Utils
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
                    isLineMode,
                    isDel
                });
            } catch (e) {
                console.warn("Invalid Regex:", search, e);
            }
        });
        return matchers;
    },

    processText(sourceText, keywordsValue) {
        // [1] Validation & Matcher Compilation
        if (!sourceText) return { html: '', countM: 0, countR: 0 };
        const matchers = this.buildMatchers(keywordsValue);

        // [2] Fast Path: No Matchers
        if (matchers.length === 0) {
            return { html: `<span class="diff-original">${TMS.Utils.escapeHtml(sourceText)}</span>`, countM: 0, countR: 0 };
        }

        // [3] Main Processing Loop (Priority Range + Tokenization)
        let cursor = 0, countM = 0, countR = 0;
        const resultParts = [];

        // Helper: Format replacement string (handle $1, $LINE, etc.)
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
                    const shouldPreserveNewline = content || (pRange.matcher.isLineMode && !pRange.matcher.isDel);
                    if (pRange.matcher.isReplacement && shouldPreserveNewline && !content.endsWith('\n') && trailingNewline) {
                        content += trailingNewline;
                    }
                    resultParts.push(`<span class="${cls}">${TMS.Utils.escapeHtml(content)}</span>`);
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
                if (nextTarget > cursor) resultParts.push(`<span class="diff-original">${TMS.Utils.escapeHtml(sourceText.substring(cursor, nextTarget))}</span>`);
                cursor = nextTarget;
                continue;
            }

            if (minIndex > cursor) resultParts.push(`<span class="diff-original">${TMS.Utils.escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);

            const bestM = textMatchers[bestIdx];
            const bestData = nextMatches[bestIdx];
            const content = getDisplayContent(bestM, bestData);
            const cls = bestM.isReplacement ? 'diff-replace' : 'diff-add';
            if (bestM.isReplacement) countR++; else countM++;
            resultParts.push(`<span class="${cls}">${TMS.Utils.escapeHtml(content)}</span>`);
            cursor = minIndex + bestData.len;
        }

        return { html: resultParts.join(''), countM, countR };
    }
};
