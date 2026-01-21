/**
 * Text Multi Search - Web Worker
 * Handles heavy regex processing off the main thread.
 */

// Wraps logic to avoid global scope pollution within the worker
(() => {
    // --- Utilities ---

    const htmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"']/g, (m) => htmlMap[m]);
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- Core Logic ---

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

                const ESCAPED_OR_PLACEHOLDER = '\uFFFF';
                let tempSearch = search.split('\\[or]').join(ESCAPED_OR_PLACEHOLDER);
                const segments = tempSearch.split(/\s*\[or\]\s*/);

                const wildcardOrder = [];
                const processedSegments = segments
                    .filter(s => s.length > 0)
                    .map(s => {
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
                // Ignore invalid regex in worker
            }
        });
        return matchers;
    }

    function processText(sourceText, keywordsValue) {
        if (!sourceText) {
            return { html: '', countM: 0, countR: 0 };
        }

        const matchers = buildMatchers(keywordsValue);

        if (matchers.length === 0) {
            return {
                html: `<span class="diff-original">${escapeHtml(sourceText)}</span>`,
                countM: 0,
                countR: 0
            };
        }

        let cursor = 0;
        let countM = 0;
        let countR = 0;
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
                            matchData: {
                                index: lineMatch.index,
                                text: lineMatch[0],
                                len: lineMatch[0].length,
                                groups: res.slice(1)
                            }
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
            let bestIdx = -1;
            let minIndex = Infinity;
            let bestLen = 0;

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
                if (nextTarget > cursor) {
                    resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, nextTarget))}</span>`);
                }
                cursor = nextTarget;
                continue;
            }

            if (minIndex > cursor) {
                resultParts.push(`<span class="diff-original">${escapeHtml(sourceText.substring(cursor, minIndex))}</span>`);
            }

            const bestM = textMatchers[bestIdx];
            const bestData = nextMatches[bestIdx];
            const content = getDisplayContent(bestM, bestData);
            const cls = bestM.isReplacement ? 'diff-replace' : 'diff-add';
            if (bestM.isReplacement) countR++; else countM++;
            resultParts.push(`<span class="${cls}">${escapeHtml(content)}</span>`);
            cursor = minIndex + bestData.len;
        }

        return {
            html: resultParts.join(''),
            countM,
            countR
        };
    }

    self.onmessage = (e) => {
        const { id, sourceText, keywordsValue } = e.data;
        try {
            const result = processText(sourceText, keywordsValue);
            self.postMessage({ id, status: 'success', ...result });
        } catch (err) {
            self.postMessage({ id, status: 'error', message: err.message });
        }
    };
})();
