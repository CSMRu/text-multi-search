/**
 * History Manager Module
 * Handles Undo/Redo functionality for Manual Edit Mode.
 */
window.TMS = window.TMS || {};

TMS.HistoryManager = {
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

    performAction(isUndo) {
        const canAction = isUndo
            ? TMS.STATE.history.pointer > 0
            : TMS.STATE.history.pointer < TMS.STATE.history.stack.length - 1;

        if (canAction) {
            TMS.STATE.history.pointer += isUndo ? -1 : 1;
            const s = TMS.STATE.history.stack[TMS.STATE.history.pointer];
            TMS.EL.outputDiv.innerHTML = s.content;
            this.setCursorOffset(TMS.EL.outputDiv, s.cursor);
            TMS.UIManager.updateActionButtonsState();
        }
    },

    /**
     * Calculates current caret position as text offset.
     * @param {HTMLElement} container 
     * @returns {number} offset
     */
    getCursorOffset(container) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return 0;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    },

    /**
     * Restores caret position from text offset.
     * @param {HTMLElement} container 
     * @param {number} offset 
     */
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
    },

    /**
     * Inserts a node at the current cursor position, splitting spans if necessary.
     * @param {Node} node 
     */
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
    }
};
