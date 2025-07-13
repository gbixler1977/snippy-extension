/**
 * formula-beautifier.js
 * A context-aware beautifier for Quickbase formulas. This version implements a hierarchical
 * set of rules to handle different formula structures intelligently.
 * Key Features:
 * - Preserves variable declarations and comments.
 * - Applies special, hardcoded formatting rules for "If" and "Case" statements.
 * - Detects functions with a high number of arguments (>4) and formats them for readability.
 * - Detects long concatenation chains (&) and breaks them into multiple lines based on context.
 * - Recursively formats nested functions with correct indentation.
 * - Ensures consistent spacing for all other operators.
 */

/**
 * Tokenizes a formula string into a stream of recognized parts.
 * @param {string} formulaString The raw formula text.
 * @param {string[]} keywordList A list of known function names.
 * @returns {Array<Object>} An array of token objects.
 */
function tokenize(formulaString, keywordList) {
    const functionKeywords = keywordList || [];
    const variableKeywords = [
        "var", "bool", "number", "text", "textlist", "date", "datetime",
        "duration", "timeofday", "workdate", "user", "recordlist"
    ];
    const allKeywords = functionKeywords.concat(variableKeywords);
    const escapedKeywords = allKeywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const keywordRegexString = `\\b(?:${escapedKeywords.join('|')})\\b`;

    const tokenPatterns = [
        /(?<COMMENT>\/\/[^\n\r]*)/,
        /(?<FIELD>\[[^\]]+\])/,
        /(?<STRING>"(?:[^\\]|\\.)*?")/,
        /(?<VARIABLE>\$[a-zA-Z_]\w*)/,
        new RegExp(`(?<KEYWORD>${keywordRegexString})`, 'i'),
        /(?<LITERAL>\b(?:true|false|null)\b)/i,
        /(?<NUMBER>0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)/i,
        /(?<OPERATOR>[-+\/*=<>!&]+|\b(?:and|or|not)\b)/i,
        /(?<LPAREN>\()/,
        /(?<RPAREN>\))/,
        /(?<COMMA>,)/,
        /(?<IDENTIFIER>[a-zA-Z_]\w*)/,
        /(?<WHITESPACE>\s+)/,
        /(?<MISMATCH>.)/
    ];

    const masterRegex = new RegExp(tokenPatterns.map(r => r.source).join('|'), 'gi');
    let tokens = [];
    let match;
    while ((match = masterRegex.exec(formulaString)) !== null) {
        const groups = match.groups;
        for (const tokenType in groups) {
            if (groups[tokenType] !== undefined) {
                if (tokenType !== 'WHITESPACE' && tokenType !== 'MISMATCH') {
                    tokens.push({ type: tokenType, value: groups[tokenType] });
                }
                break;
            }
        }
    }
    return tokens;
}

/**
 * Counts the number of top-level arguments in a function call from a token stream.
 * @param {Array<Object>} tokens The array of all tokens.
 * @param {number} startIndex The index of the token immediately after the function's opening parenthesis.
 * @returns {number} The number of top-level arguments.
 */
function getFunctionArgCount(tokens, startIndex) {
    let parenLevel = 1;
    if (tokens[startIndex + 1] && tokens[startIndex + 1].type === 'RPAREN') {
        return 0;
    }
    let argCount = 1;
    for (let i = startIndex + 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'LPAREN') {
            parenLevel++;
        } else if (token.type === 'RPAREN') {
            parenLevel--;
            if (parenLevel === 0) break;
        } else if (token.type === 'COMMA' && parenLevel === 1) {
            argCount++;
        }
    }
    return argCount;
}

/**
 * The main beautification function.
 * @param {string} codeString The raw formula to format.
 * @param {string[]} functions A list of known function names.
 * @returns {string} The beautified formula.
 */
function beautifyFormula(codeString, functions) {
    const lines = codeString.split('\n');
    const preservedLines = [];
    let codeToProcess = lines.map((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().startsWith('var ') || trimmedLine.startsWith('//')) {
            const placeholder = `//__PLACEHOLDER_${index}__`;
            preservedLines.push({ placeholder, original: line });
            return placeholder;
        }
        return line;
    }).join('\n');

    const tokens = tokenize(codeToProcess, functions);
    if (tokens.length === 0) return codeString;

    const AMPERSAND_THRESHOLD = 3;
    const ampersandCount = tokens.filter(t => t.value === '&').length;
    const isLongChain = ampersandCount > AMPERSAND_THRESHOLD;

    let formattedCode = '';
    let indentationLevel = 0;
    const indentString = '  ';
    const contextStack = [];
    const ARG_COUNT_THRESHOLD = 4;

    const getCurrentContext = () => contextStack.length > 0 ? contextStack[contextStack.length - 1] : null;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const nextToken = (i + 1 < tokens.length) ? tokens[i + 1] : null;
        let currentContext = getCurrentContext();

        switch (token.type) {
            case 'KEYWORD':
                formattedCode += token.value;
                if (nextToken && nextToken.type === 'LPAREN') {
                    const funcName = token.value.toLowerCase();
                    const totalArgs = getFunctionArgCount(tokens, i + 1);
                    const isStructural = funcName === 'if' || funcName === 'case' || totalArgs > ARG_COUNT_THRESHOLD;
                    contextStack.push({
                        name: funcName,
                        argIndex: 0,
                        isStructural: isStructural
                    });
                }
                break;

            case 'LPAREN':
                formattedCode += token.value;
                currentContext = getCurrentContext();
                if (currentContext && currentContext.isStructural) {
                    indentationLevel++;
                    formattedCode += '\n' + indentString.repeat(indentationLevel);
                }
                break;

            case 'RPAREN':
                currentContext = getCurrentContext();
                if (currentContext && currentContext.isStructural) {
                    indentationLevel = Math.max(0, indentationLevel - 1);
                    formattedCode = formattedCode.trimEnd();
                    formattedCode += '\n' + indentString.repeat(indentationLevel);
                }
                formattedCode += token.value;
                if (currentContext) {
                    contextStack.pop();
                }
                break;

            case 'COMMA':
                currentContext = getCurrentContext();
                if (currentContext && currentContext.isStructural) {
                    currentContext.argIndex++;
                    if (currentContext.name === 'case' && currentContext.argIndex > 0 && currentContext.argIndex % 2 !== 0) {
                        formattedCode += ', ';
                    } else {
                        formattedCode = formattedCode.trimEnd() + ',\n' + indentString.repeat(indentationLevel);
                    }
                } else {
                    formattedCode += ', ';
                }
                break;

            case 'OPERATOR':
                if (token.value === '&' && isLongChain && !currentContext) {
                    // NEW LOGIC: Look ahead to decide whether to break the line.
                    let shouldBreak = true;
                    if (nextToken && (nextToken.type === 'FIELD' || nextToken.type === 'VARIABLE')) {
                        // If the ampersand is followed by a field or variable, it's likely a key-value
                        // pair that should stay on the same line as the key.
                        shouldBreak = false;
                    }

                    if (shouldBreak) {
                        formattedCode = formattedCode.trimEnd() + '\n' + indentString.repeat(indentationLevel + 1) + '& ';
                    } else {
                        formattedCode = formattedCode.trimEnd() + ' & ';
                    }
                } else {
                    // Default spacing for all other operators or ampersands inside functions.
                    formattedCode = formattedCode.trimEnd() + ' ' + token.value + ' ';
                }
                break;
            
            case 'COMMENT':
                const preserved = preservedLines.find(p => token.value.includes(p.placeholder));
                 if (preserved) {
                    if (formattedCode.length > 0 && !formattedCode.endsWith('\n')) {
                        formattedCode = formattedCode.trimEnd() + '\n';
                    }
                    formattedCode += indentString.repeat(indentationLevel) + preserved.original.trim() + '\n';
                }
                break;

            default:
                formattedCode += token.value;
                break;
        }
    }

    return formattedCode.split('\n').map(line => line.trimEnd()).join('\n').trim();
}
