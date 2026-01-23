# Text Multi Search
| <div align="center"> <a href="https://csmru.github.io/text-multi-search/"><img src="favicon.svg" width="64"></a> <br> [![Version](https://img.shields.io/badge/Version-26.0123c-B5E853?style=flat-square)](https://github.com/csmru/text-multi-search/commits) [![Hosted on GitHub Pages](https://img.shields.io/badge/GitHub-Pages-2b7346?style=flat-square&logo=github)](https://csmru.github.io/text-multi-search/) </div> |
| :--- |

> **Client-side text processor** for simultaneous multi-keyword search, batch replacement, and pattern analysis.

## 🧩 Syntax Cheat Sheet

Enter each rule on a new line.

| Keyword | Description | Example | Result |
| :--- | :--- | :--- | :--- |
| **`Text`** | **Basic Match**. Highlights text. | `Hello` | Highlights "Hello" |
| **`A///B`** | **Replace**. Substitutes A with B. | `fix///fixed` | Replaces "fix" → "fixed" |
| **`[line]`** | **Line Mode**. Selects entire line if match found. | `[line]Hello` | Selects whole line containing "Hello" |
| **`[del]`** | **Delete**. Removes match (or line). | `[line]Log///[del]` | Deletes lines containing "Log" |
| **`[or]`** | **Logic**. Match A OR B. | `App[or]Web` | Matches "App" or "Web" |
| **`[num]`** | **Digits**. Captures numbers (`$1`). | `ID:[num]` | Matches "ID:123" |
| **`[cjk]`** | **Chinese Characters**. Captures ideographs (`$1`). | `[cjk]` | Matches "山", "文" |
| **`///`** | **Comment**. Ignored line. | `/// Title` | (Ignored) |

### Replacement Variables
Captured wildcards (`[num]`, `[cjk]`) can be used in replacement.
*   `Item [num]///Item #$1` → "Item 10" becomes "Item #10"
*   `[num]-[num]///$2.$1` → "2024-01" becomes "01.2024"

---

## ⚖️ Matching Priority (The 3 Laws)

The engine scans the text in a **single pass**. If multiple rules could match the same part of the text, the winner is decided by these laws in order:

0.  **`[line]` Mode (Super Law)**: Rules starting with `[line]` always take precedence over word-level rules. If a line matches, it is processed first as a whole.
1.  **Leftmost First**: The match starting **earliest** in the text wins.
    *   *Input:* `Banana` | *Rules:* `na`, `Ba` → **`Ba`** wins (starts at index 0).
2.  **Longest First**: If start positions are identical, the **longer** match wins.
    *   *Input:* `AppleJuice` | *Rules:* `Apple`, `AppleJuice` → **`AppleJuice`** wins (10 chars vs 5).
3.  **First Defined**: If both position and length are identical, the rule defined **higher** in the list wins.
    *   *Input:* `Test` | *Rules:* 1. `Test` 2. `Test///Done` → **1st rule** wins (Replacement fails).



---

## ⚡ Common Patterns

| Goal | Pattern Rule | Explanation |
| :--- | :--- | :--- |
| **Slim Logs** | `[line]Info [or] Debug///[del]` | Deletes Info/Debug lines to keep only Errors. |
| **Mask Phone** | `010-[num]-[num]///010-****-$2` | Hide middle digits: `010-1234-5678` → `010-****-5678`. |
| **Clean Terms** | `Signin[or]Log-in///Login` | Unify inconsistent terms into `Login`. |
| **Extract IDs** | `[line]User_id: [num]///$1` | Replaces whole line with just the ID number. |
| **Mask Name** | `[cjk][cjk][cjk]///$1*$3` | Hide middle Hanja: `金閣寺` → `金*寺`. |
| **Format Data** | `[num]x[num]///W:$1 H:$2` | Reformat `1920x1080` → `W:1920 H:1080`. |

## ⌨️ Shortcuts & Mode
*   **Manual Edit**: Click <i data-lucide="unlink"></i> (Unlink) to type directly in the result.
*   **Copy Source**: `Ctrl` + `Alt` + `C` (In Development).

## License
MIT License. [View Source](https://github.com/csmru/text-multi-search).
