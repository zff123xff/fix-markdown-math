const vscode = require("vscode");

const superscriptMap = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "=",
    "ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e",
    "ᶠ": "f", "ᵍ": "g", "ʰ": "h", "ⁱ": "i", "ʲ": "j",
    "ᵏ": "k", "ˡ": "l", "ᵐ": "m", "ⁿ": "n", "ᵒ": "o",
    "ᵖ": "p", "ʳ": "r", "ˢ": "s", "ᵗ": "t", "ᵘ": "u",
    "ᵛ": "v", "ʷ": "w", "ˣ": "x", "ʸ": "y", "ᶻ": "z",
    "ᴬ": "A", "ᴮ": "B", "ᴰ": "D", "ᴱ": "E", "ᴳ": "G",
    "ᴴ": "H", "ᴵ": "I", "ᴶ": "J", "ᴷ": "K", "ᴸ": "L",
    "ᴹ": "M", "ᴺ": "N", "ᴼ": "O", "ᴾ": "P", "ᴿ": "R",
    "ᵀ": "T", "ᵁ": "U", "ⱽ": "V", "ᵂ": "W"
};

const subscriptMap = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "-", "₌": "=",
    "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i", "ⱼ": "j",
    "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₒ": "o",
    "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t", "ᵤ": "u",
    "ᵥ": "v", "ₓ": "x"
};

function convertUnicodeScripts(text) {
    const superChars = Object.keys(superscriptMap).join("");
    const subChars = Object.keys(subscriptMap).join("");

    text = text.replace(
        new RegExp(`[${superChars}]+`, "g"),
        (match) => {
            const content = [...match].map(c => superscriptMap[c] ?? c).join("");
            return `^{${content}}`;
        }
    );

    text = text.replace(
        new RegExp(`[${subChars}]+`, "g"),
        (match) => {
            const content = [...match].map(c => subscriptMap[c] ?? c).join("");
            return `_{${content}}`;
        }
    );

    return text;
}

function normalizeMarkdown(text) {
    let result = text;

    result = result
        .replace(/\\\*/g, "*")
        .replace(/\\#/g, "#")
        .replace(/\\`/g, "`")
        .replace(/&#65292;/g, "，")
        .replace(/&#12290;/g, "。")
        .replace(/&#65306;/g, "：")
        .replace(/&#65307;/g, "；");

    result = result.replace(/\*{4}([^*\n]+)\*{4}/g, "**$1**");

    return result;
}

function normalizeLatex(text) {
    let result = text;

    result = convertUnicodeScripts(result);

    // \\Sigma -> \Sigma
    result = result.replace(/\\{2,}(?=[A-Za-z])/g, "\\");

    // 普通字符多余转义
    result = result
        .replace(/\\_/g, "_")
        .replace(/\\\+/g, "+")
        .replace(/\\=/g, "=");

    // 分隔符
    result = result
        .replace(/\\{2,}\|/g, "\\|")
        .replace(/\\{2,}\{/g, "\\{")
        .replace(/\\{2,}\}/g, "\\}")
        .replace(/\\{2,}\[/g, "\\[")
        .replace(/\\{2,}\]/g, "\\]")
        .replace(/\\{2,}\(/g, "\\(")
        .replace(/\\{2,}\)/g, "\\)");

    // \left / \right
    result = result
        .replace(/\\left\\\[/g, "\\left[")
        .replace(/\\right\\\]/g, "\\right]")
        .replace(/\\left\\\(/g, "\\left(")
        .replace(/\\right\\\)/g, "\\right)")
        .replace(/\\left\\\\+\{/g, "\\left\\{")
        .replace(/\\right\\\\+\}/g, "\\right\\}");

    return result;
}

function protectInlineMath(text) {
    const protectedItems = [];

    text = text.replace(/\$[^$\n]+\$/g, (match) => {
        const token = `@@INLINE_MATH_${protectedItems.length}@@`;
        protectedItems.push(match);
        return token;
    });

    return { text, protectedItems };
}

function restoreInlineMath(text, protectedItems) {
    protectedItems.forEach((value, index) => {
        text = text.replace(`@@INLINE_MATH_${index}@@`, value);
    });
    return text;
}

function fixInlineMathInText(text) {
    let result = normalizeMarkdown(text);
    result = normalizeLatex(result);

    const protectedResult = protectInlineMath(result);
    result = protectedResult.text;

    // 包裹明显的行内数学变量，要求至少带 _ 或 ^
    result = result.replace(
        /(?<![A-Za-z0-9_$])((?:\\[A-Za-z]+|[A-Za-z])(?:(?:_\{[^{}\n]+\})|(?:_[A-Za-z0-9]+)|(?:\^\{[^{}\n]+\})|(?:\^[A-Za-z0-9+\-]+))+)(?![A-Za-z0-9_$])/g,
        (match) => `$${match}$`
    );

    result = restoreInlineMath(result, protectedResult.protectedItems);
    return result;
}

function looksLikeStandaloneFormulaLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // 已经是块定界符
    if (trimmed === "$$" || trimmed === "\\[" || trimmed === "\\]") {
        return false;
    }

    const chineseCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
    if (chineseCount > 0) return false;

    const mathSignals = (trimmed.match(/[_^=+\-*/]|\\[A-Za-z]+/g) || []).length;

    // 有等号/下标/上标，且信号足够多
    if (mathSignals >= 3) return true;

    return false;
}

function fixEverything(text) {
    let input = normalizeMarkdown(text);
    input = normalizeLatex(input);

    const lines = input.split(/\r?\n/);
    const output = [];

    let inDisplayMath = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();

        // 统一块公式定界符
        if (trimmed === "\\[" || trimmed === "$$") {
            if (!inDisplayMath) {
                output.push("$$");
                inDisplayMath = true;
            } else {
                output.push("$$");
                inDisplayMath = false;
            }
            continue;
        }

        if (trimmed === "\\]") {
            if (inDisplayMath) {
                output.push("$$");
                inDisplayMath = false;
            } else {
                output.push("$$");
            }
            continue;
        }

        if (inDisplayMath) {
            output.push(normalizeLatex(line));
            continue;
        }

        if (!trimmed) {
            output.push(line);
            continue;
        }

        // 整行像一个单独公式 -> 包成块公式
        if (looksLikeStandaloneFormulaLine(line)) {
            output.push("$$");
            output.push(normalizeLatex(trimmed));
            output.push("$$");
            continue;
        }

        // 其余按普通正文处理，自动补行内公式
        output.push(fixInlineMathInText(line));
    }

    if (inDisplayMath) {
        output.push("$$");
    }

    return output.join("\n");
}

function activate(context) {
    const disposable = vscode.commands.registerCommand(
        "fixMarkdownMath.fix",
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showWarningMessage(
                    "Fix Markdown Math: 没有打开的文件。"
                );
                return;
            }

            const document = editor.document;

            // 读取整个文件
            const originalText = document.getText();

            // 对整个文件进行修复
            const fixedText = fixEverything(originalText);

            if (fixedText === originalText) {
                vscode.window.showInformationMessage(
                    "Fix Markdown Math: 当前文件无需修改。"
                );
                return;
            }

            // 整个文档范围
            const start = new vscode.Position(0, 0);

            const lastLine = document.lineAt(
                document.lineCount - 1
            );

            const end = lastLine.rangeIncludingLineBreak.end;

            const fullRange = new vscode.Range(start, end);

            // 整个文件一次性替换
            const success = await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, fixedText);
            });

            if (success) {
                vscode.window.showInformationMessage(
                    "Fix Markdown Math: 已修复整个文件。"
                );
            } else {
                vscode.window.showErrorMessage(
                    "Fix Markdown Math: 文件修改失败。"
                );
            }
        }
    );

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};