if (!window.SNIPPY_DEBUG_MODE) {
  console.log = console.info = console.debug = console.warn = () => {};
}

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
		/(?<VARIABLE>\$[A-Za-z_][A-Za-z0-9_]*)/,
		/(?<FIELD>\[[^\]\n]+\])/,
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
    // 1) Preserve multi-line var declarations as atomic blocks until their ending semicolon.
const preservedVarBlocks = [];
let codeToProcess = codeString.replace(/(^\s*var\b[\s\S]*?;)/gmi, (match) => {
  const placeholder = `//__VARBLOCK_${preservedVarBlocks.length}__`;
  preservedVarBlocks.push({ placeholder, original: match });
  return placeholder;
});

// 2) Preserve full-line comments (keeps your existing comment behavior).
const preservedCommentLines = [];
codeToProcess = codeToProcess
  .split('\n')
  .map((line, index) => {
    const trimmedLine = line.trim();

    // ⛔ IMPORTANT: Do NOT re-preserve our own var-block placeholders as comments.
    if (trimmedLine.startsWith('//__VARBLOCK_')) {
      return line; // leave the placeholder alone; it will be restored from preservedVarBlocks
    }

    // Preserve only true full-line comments.
    if (trimmedLine.startsWith('//')) {
      const placeholder = `//__COMMENT_${index}__`;
      preservedCommentLines.push({ placeholder, original: line });
      return placeholder;
    }

    return line;
  })
  .join('\n');



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
			case 'STRING':
  // Preserve quoted text exactly as written (supports escaped quotes).
  formattedCode += token.value;
  break;

case 'NUMBER':
case 'LITERAL':
case 'IDENTIFIER':
  // Print numbers (e.g., 5), literals (true/false/null), and bare identifiers (e.g., URLRoot, AppID).
  formattedCode += token.value;
  break;

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
				
			case 'VARIABLE':
case 'FIELD':
  // Output $vars and [Field Names] verbatim
  formattedCode += token.value;
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
                    
                    let shouldBreak = true;
                    if (nextToken && (nextToken.type === 'FIELD' || nextToken.type === 'VARIABLE')) {
                        
                        shouldBreak = false;
                    }

                    if (shouldBreak) {
                        formattedCode = formattedCode.trimEnd() + '\n' + indentString.repeat(indentationLevel + 1) + '& ';
                    } else {
                        formattedCode = formattedCode.trimEnd() + ' & ';
                    }
                } else {
                    
                    formattedCode = formattedCode.trimEnd() + ' ' + token.value + ' ';
                }
                break;
            
            case 'COMMENT': {
    // Try to restore a preserved var-block first, then a preserved comment line.
    const preserved =
      preservedVarBlocks.find(p => token.value.includes(p.placeholder)) ||
      preservedCommentLines.find(p => token.value.includes(p.placeholder));

    if (preserved) {
      if (formattedCode.length > 0 && !formattedCode.endsWith('\n')) {
        formattedCode = formattedCode.trimEnd() + '\n';
      }
      // Reinsert exactly what we captured (including any internal newlines and the trailing semicolon for var-blocks).
      formattedCode += indentString.repeat(indentationLevel) + preserved.original.replace(/\s+$/, '') + '\n';
    }
    break;
}

                 
        }
    }

    return formattedCode.split('\n').map(line => line.trimEnd()).join('\n').trim();
}
