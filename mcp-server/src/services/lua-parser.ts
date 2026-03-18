/**
 * Generic Lua parser for ESO SavedVariables and addon files.
 * Parses Lua table syntax into JavaScript objects.
 */

import { readFileSync, existsSync } from 'fs';

/**
 * Parse a Lua table literal string into a JavaScript object
 * Handles: strings, numbers, booleans, nested tables, arrays
 */
export function parseLuaTable(content: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Match string key-value pairs: ["key"] = value
  const stringKvRegex = /\["([^"]+)"\]\s*=\s*/g;
  let match;

  while ((match = stringKvRegex.exec(content)) !== null) {
    const key = match[1];
    const valueStart = match.index + match[0].length;

    const value = extractLuaValue(content, valueStart);
    if (value !== undefined) {
      result[key] = value.value;
    }
  }

  // Match numeric key-value pairs: [1] = value
  const numKvRegex = /\[(\d+)\]\s*=\s*/g;
  while ((match = numKvRegex.exec(content)) !== null) {
    const key = match[1];
    const valueStart = match.index + match[0].length;

    const value = extractLuaValue(content, valueStart);
    if (value !== undefined) {
      result[key] = value.value;
    }
  }

  return result;
}

/**
 * Extract a Lua value starting at the given position
 */
function extractLuaValue(content: string, pos: number): { value: any; endPos: number } | undefined {
  // Skip whitespace
  while (pos < content.length && /\s/.test(content[pos])) pos++;

  if (pos >= content.length) return undefined;

  const char = content[pos];

  // String value
  if (char === '"') {
    let end = pos + 1;
    while (end < content.length && content[end] !== '"') {
      if (content[end] === '\\') end++; // skip escaped chars
      end++;
    }
    return { value: content.slice(pos + 1, end), endPos: end + 1 };
  }

  // Table value
  if (char === '{') {
    const blockEnd = findMatchingBrace(content, pos);
    if (blockEnd === -1) return undefined;
    const inner = content.slice(pos + 1, blockEnd);
    const parsed = parseLuaTable(inner);
    return { value: parsed, endPos: blockEnd + 1 };
  }

  // Boolean
  if (content.slice(pos, pos + 4) === 'true') {
    return { value: true, endPos: pos + 4 };
  }
  if (content.slice(pos, pos + 5) === 'false') {
    return { value: false, endPos: pos + 5 };
  }

  // Nil
  if (content.slice(pos, pos + 3) === 'nil') {
    return { value: null, endPos: pos + 3 };
  }

  // Number (including negative and decimal)
  const numMatch = content.slice(pos).match(/^-?\d+(\.\d+)?/);
  if (numMatch) {
    return { value: parseFloat(numMatch[0]), endPos: pos + numMatch[0].length };
  }

  return undefined;
}

/**
 * Find the matching closing brace for an opening brace
 */
function findMatchingBrace(content: string, openPos: number): number {
  let depth = 0;
  let inString = false;

  for (let i = openPos; i < content.length; i++) {
    const char = content[i];

    if (char === '\\' && inString) {
      i++; // skip escaped char
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Read and parse a Lua SavedVariables file
 */
export function parseSavedVariablesFile(filePath: string): Record<string, any> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const result: Record<string, any> = {};

  // Find top-level variable assignments: VarName = { ... }
  const topLevelRegex = /^(\w+)\s*=\s*\{/gm;
  let match;

  while ((match = topLevelRegex.exec(content)) !== null) {
    const varName = match[1];
    const tableStart = match.index + match[0].length - 1;
    const tableEnd = findMatchingBrace(content, tableStart);

    if (tableEnd !== -1) {
      const tableContent = content.slice(tableStart + 1, tableEnd);
      result[varName] = parseLuaTable(tableContent);
    }
  }

  return result;
}

/**
 * Analyze a SavedVariables file structure without fully parsing it
 * (More performant for large files)
 */
export function analyzeSavedVariablesStructure(filePath: string): {
  fileSize: number;
  topLevelVars: string[];
  estimatedEntries: number;
  maxDepth: number;
  lineCount: number;
} {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');
  const fileSize = Buffer.byteLength(content, 'utf-8');

  // Find top-level variables
  const topLevelRegex = /^(\w+)\s*=/gm;
  const topLevelVars: string[] = [];
  let match;
  while ((match = topLevelRegex.exec(content)) !== null) {
    topLevelVars.push(match[1]);
  }

  // Estimate entries
  const estimatedEntries = (content.match(/\["/g) || []).length;

  // Estimate max depth by counting max consecutive opening braces
  let maxDepth = 0;
  let currentDepth = 0;
  for (const char of content) {
    if (char === '{') {
      currentDepth++;
      if (currentDepth > maxDepth) maxDepth = currentDepth;
    } else if (char === '}') {
      currentDepth--;
    }
  }

  const lineCount = content.split('\n').length;

  return { fileSize, topLevelVars, estimatedEntries, maxDepth, lineCount };
}
