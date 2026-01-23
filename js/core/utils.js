/**
 * Core Utilities
 * Common helper functions used across modules.
 * Compatible with Main Thread (window) and Web Worker (self).
 */

const globalScope = typeof window !== 'undefined' ? window : self;
globalScope.TMS = globalScope.TMS || {};
globalScope.TMS.Utils = {};

const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

/** Safely escapes text to prevent HTML injection */
TMS.Utils.escapeHtml = function (text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
};

/** Escapes characters for Regular Expressions */
TMS.Utils.escapeRegExp = function (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/** Re-initializes Lucide icons */
TMS.Utils.refreshIcons = function () {
    if (window.lucide) window.lucide.createIcons();
};

/** Checks if a DOM element is a diff span */
TMS.Utils.isStyledSpan = function (el) {
    return el && (
        el.classList.contains('diff-add') ||
        el.classList.contains('diff-replace') ||
        el.classList.contains('diff-original')
    );
};

/** Calculates dynamic debounce delay based on text length */
TMS.Utils.getSmartDebounceDelay = function (length) {
    if (!length) return TMS.CONFIG.DEBOUNCE_DELAY;
    if (length < 5000) return 100;
    if (length < 50000) return 300;
    if (length < 200000) return 450;
    return 600;
};
