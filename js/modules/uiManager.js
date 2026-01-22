/**
 * UI Manager Module
 * Handles visual updates, toasts, and input highlighting.
 */
window.TMS = window.TMS || {};

TMS.UIManager = {
    // =========================================================================
    // [1] Generic UI Controls (Theme, Toast, Font)
    // =========================================================================

    showToast(message, type = 'error') {
        const container = document.getElementById('toast-container');
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

    toggleTheme() {
        const html = document.documentElement;
        const newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        if (TMS.EL.btnTheme) {
            TMS.EL.btnTheme.innerHTML = `<i data-lucide="${newTheme === 'dark' ? 'moon' : 'sun'}"></i>`;
            TMS.Utils.refreshIcons();
        }
    },

    updateFontSize(delta) {
        if (delta) {
            TMS.STATE.fontSize = Math.max(8, Math.min(24, TMS.STATE.fontSize + delta));
        }
        TMS.EL.fontSizeDisplay.textContent = `${TMS.STATE.fontSize}pt`;
        document.documentElement.style.setProperty('--font-size-base', `${TMS.STATE.fontSize * 1.333}px`);
    },

    // =========================================================================
    // [2] App-Specific UI Logic
    // =========================================================================

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

        TMS.EL.btnKeywordsLock.innerHTML = `<i data-lucide="${icon}"></i>`;
        TMS.EL.btnKeywordsLock.title = title;
        TMS.EL.btnKeywordsLock.classList.toggle('locked', TMS.STATE.isKeywordsLocked);
        TMS.EL.btnKeywordsLock.classList.toggle('unlocked', !TMS.STATE.isKeywordsLocked);

        TMS.Utils.refreshIcons();

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

    // =========================================================================
    // [3] Complex Rendering Logic
    // =========================================================================

    syncBackdrop() {
        if (!TMS.EL.keywordsInput || !TMS.EL.keywordsBackdrop) return;

        // Simple optimization to reuse cache if no changes
        // (For now, we just rebuild highlighting every time)
        const text = TMS.EL.keywordsInput.value;
        const scroll = TMS.EL.keywordsInput.scrollTop;

        // Syntax Highlighting for Keywords
        // 1. Comments
        // 2. [line], [or], [num], [cjk] reserved words
        // 3. Search///Replace separator

        // Context-Aware Highlighting via Line Processing
        const lines = text.split('\n');

        const processed = lines.map(line => {
            const safeLine = TMS.Utils.escapeHtml(line);

            // 1. Comment Line
            if (safeLine.trim().startsWith('///')) {
                return `<span class="comment">${safeLine}</span>`;
            }

            // 2. Tokenize (Search /// Replace)
            const sepIdx = safeLine.indexOf('///');

            // Helper to highlight Search Tokens
            const highlightSearch = (str) => {
                // [line] only at start
                let s = str.replace(/^(\s*)(\[line\])/, '$1<span class="reserved">$2</span>');
                // [or], [num], [cjk] anywhere
                return s.replace(/(\[(?:num|cjk|or)\])/g, '<span class="reserved">$1</span>');
            };

            if (sepIdx === -1) {
                return highlightSearch(safeLine);
            }

            const searchPart = safeLine.substring(0, sepIdx);
            const replacePart = safeLine.substring(sepIdx + 3);

            const searchHi = highlightSearch(searchPart);
            let replaceHi = replacePart;

            // [del] only if functionality active (sole content)
            if (replacePart.trim() === '[del]') {
                replaceHi = replaceHi.replace(/\[del\]/, '<span class="reserved">[del]</span>');
            } else {
                // [num], [cjk] in replacement (backreferences)
                replaceHi = replaceHi.replace(/(\[(?:num|cjk)\])/g, '<span class="reserved">$1</span>');

                // [line] in replacement (only if line mode active AND no wildcards used)
                const isLineStart = searchPart.trim().startsWith('[line]');
                const hasWildcards = /\[(?:num|cjk)\]/.test(searchPart);
                if (isLineStart && !hasWildcards) {
                    replaceHi = replaceHi.replace(/(\[line\])/g, '<span class="reserved">$1</span>');
                }
            }

            return `${searchHi}<span class="separator">///</span>${replaceHi}`;
        });

        TMS.EL.keywordsBackdrop.innerHTML = processed.join('<br>') + '<br>';
        TMS.EL.keywordsBackdrop.scrollTop = scroll;
    }
};
