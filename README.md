# Text Multi Search
| <div align="center"> <a href="https://csmru.github.io/text-multi-search/"><img src="favicon.svg" width="128"></a> <br> [![Version](https://img.shields.io/badge/Version-26.0122d-B5E853?style=for-the-badge)](https://github.com/csmru/text-multi-search/commits) [![Hosted on GitHub Pages](https://img.shields.io/badge/GitHub-Pages-2b7346?style=for-the-badge&logo=github)](https://csmru.github.io/text-multi-search/) </div> |
| :--- |

> A powerful, client-side text analysis tool for searching, highlighting, and replacing multiple keywords simultaneously. Designed for developers and data analysts who need quick, visual text manipulation without leaving the browser.

## Features

-   **⚡ Simultaneous Multi-Search**: Highlight hundreds of different keywords instantly with distinct colors.
-   **🔄 Batch Replacement**: Define `Search///Replace` rules to perform multiple substitutions in one pass.
-   **🗑️ Text Deletion**: Use `Search///[del]` syntax to remove matched text entirely.
-   **🧩 Advanced Pattern Matching**:
    -   **Wildcards**: Built-in number wildcard `[num]` and CJK character wildcard `[cjk]` support.
-   **✏️ Manual Edit Mode**: Unlink the result to make manual corrections with a distinct blue highlight.
-   **🔒 100% Private**: All processing happens locally in your browser. No data is sent to any server.
-   **🌗 Light & Dark Mode**: Automatic theme detection with manual toggle.

## How to Use

### 1. Basic Syntax
Enter each rule on a new line. The most basic rule is a simple keyword search.

| Syntax | Description | Example |
| :--- | :--- | :--- |
| `Keyword` | Highlights "Keyword" in the text. | `Error` |
| `Search///Replace` | Replaces "Search" with "Replace". | `fix///fixed` |
| `/// Comment` | Lines starting with `///` are ignored. | `/// This is a comment` |

### 2. Advanced Reserved Words
Unlock powerful text processing capabilities with these reserved keywords.

| Keyword | Type | Description & Usage |
| :--- | :--- | :--- |
| **`[line]`** | **Selector** | **Line Mode**. Selects the *entire line* if it contains the following text.<br>• `[line]Error`: Highlights the whole line containing "Error".<br>• `[line]A///B`: Replaces the *whole line* containing "A" with "B". |
| **`[del]`** | **Action** | **Deletion**. Use in the *Replacement* field to remove the match.<br>• `Key///[del]`: Removes the word "Key".<br>• `[line]Log///[del]`: deletes the *entire line* containing "Log". |
| **`[or]`** | **Logic** | **Alternation**. Matches either the left OR right term.<br>• `apple[or]banana`: Matches "apple" or "banana".<br>• `[line]Err[or]Warn`: Matches lines containing "Err" OR "Warn". |
| **`[num]`** | **Wildcard** | **Number**. Matches any sequence of digits (0-9).<br>• `User[num]`: Matches "User1", "User999".<br>• Captured automatically as a variable `$1`, `$2`... |
| **`[cjk]`** | **Wildcard** | **Chinese characters**. Matches a single Chinese character.<br>• `[cjk]`: Matches "山", "田".<br>• Ranges: `\u4E00-\u9FFF` only. |

### 3. Replacement Variables (Capture Groups)
When using wildcards (`[num]`, `[cjk]`) in the search, their values are captured and can be reused in the replacement using `$1`, `$2`, etc.

| Search Pattern | Replacement | Input Text | Output Text |
| :--- | :--- | :--- | :--- |
| `Item [num]` | `Item #$1` | `Item 50` | `Item #50` |
| `[cjk] matches` | `[$1]` | `山 matches` | `[山]` |
| `[num] x [num]` | `$2 by $1` | `100 x 200` | `200 by 100` |

---

## 🍳 Recipes (Useful Combinations)

Here are some powerful combinations you can use right away:

### 🧹 Log Cleaning
**Goal**: Remove all lines that are just "Info" or "Debug" logs, keeping only errors.
```text
[line]Info [or] Debug///[del]
```
> **Explanation**: Finds any line containing "Info" OR "Debug" and deletes the matched line entirely.

### 🆔 extracting IDs
**Goal**: Turn a list of "User: ID12345 (Active)" into clean list of IDs "12345".
```text
[line]User: ID[num] (Active)///$1
```
> **Explanation**: `[line]` grabs the whole line. `[num]` captures the ID digits. The replacement `$1` replaces the *whole line* with just the captured number.

### 🌐 CJK Isolation
**Goal**: Wrap Chinese characters in brackets to find them easily.
```text
[cjk]///[$1]
```
> **Explanation**: Matches every single Chinese character and wraps it like `[山]`.

### 🔄 Data Reformatting
**Goal**: Change "Width: 1920, Height: 1080" to "1920x1080".
```text
Width: [num], Height: [num]///$1x$2
```
> **Explanation**: The first `[num]` is `$1`, the second is `$2`. We drop the text and just keep the numbers with an `x` separator.

### 2. Manual Editing
Click the **Unlink** button (<i data-lucide="link"></i>) to switch to Edit Mode. You can now type directly in the result panel. Your manual changes will be highlighted in **Blue**.

## Dependencies

-   **[Lucide Icons](https://lucide.dev/)**: For beautiful, consistent iconography.
-   **[Google Fonts](https://fonts.google.com/)**: Inter & Noto Sans JP.

## License

This project is open source and available under the [MIT License](LICENSE).
