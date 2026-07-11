function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const KEYWORDS = new Set([
  'package', 'import', 'class', 'object', 'interface', 'fun', 'val', 'var', 'const', 'lateinit',
  'if', 'else', 'when', 'for', 'while', 'do', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw',
  'in', 'is', 'as', 'null', 'true', 'false', 'this', 'super',
  'public', 'private', 'protected', 'internal',
  'open', 'override', 'abstract', 'final', 'sealed', 'data', 'enum', 'annotation', 'companion',
  'typealias', 'where', 'by', 'get', 'set'
]);

const TYPES = new Set([
  'Any', 'Unit', 'Nothing', 'Boolean', 'Byte', 'Short', 'Int', 'Long', 'Float', 'Double', 'Char', 'String',
  'List', 'MutableList', 'Set', 'MutableSet', 'Map', 'MutableMap', 'Pair', 'Triple', 'Array',
  'IntArray', 'LongArray', 'FloatArray', 'DoubleArray', 'BooleanArray', 'CharArray', 'ByteArray', 'ShortArray',
  'void', 'boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'char', 'Integer', 'Character',
  'MutableCollection', 'Collection', 'Iterable', 'Sequence', 'Optional', 'HashMap', 'HashSet', 'ArrayList', 'LinkedList'
]);

function isIdentStart(ch) {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch) {
  return /[0-9]/.test(ch);
}

function wrap(cls, text) {
  return `<span class="${cls}">${text}</span>`;
}

export function highlightKotlin(raw) {
  if (!raw) return '';
  const source = String(raw).replaceAll('\r\n', '\n');
  let index = 0;
  let output = '';

  while (index < source.length) {
    const ch = source[index];
    const pair = source.slice(index, index + 2);

    if (pair === '//') {
      const end = source.indexOf('\n', index);
      const piece = end === -1 ? source.slice(index) : source.slice(index, end);
      output += wrap('tok-com', escapeHtml(piece));
      index += piece.length;
      continue;
    }

    if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      const piece = end === -1 ? source.slice(index) : source.slice(index, end + 2);
      output += wrap('tok-com', escapeHtml(piece));
      index += piece.length;
      continue;
    }

    if (ch === '"') {
      let cursor = index + 1;
      let escaped = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '"') {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      const piece = source.slice(index, cursor);
      output += wrap('tok-str', escapeHtml(piece));
      index = cursor;
      continue;
    }

    if (ch === "'") {
      let cursor = index + 1;
      let escaped = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === "'") {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      const piece = source.slice(index, cursor);
      output += wrap('tok-str', escapeHtml(piece));
      index = cursor;
      continue;
    }

    if (isDigit(ch)) {
      let cursor = index + 1;
      while (cursor < source.length && /[0-9._]/.test(source[cursor])) cursor += 1;
      const piece = source.slice(index, cursor);
      output += wrap('tok-num', escapeHtml(piece));
      index = cursor;
      continue;
    }

    if (isIdentStart(ch)) {
      let cursor = index + 1;
      while (cursor < source.length && isIdentPart(source[cursor])) cursor += 1;
      const ident = source.slice(index, cursor);
      let lookahead = cursor;
      while (lookahead < source.length && (source[lookahead] === ' ' || source[lookahead] === '\t')) lookahead += 1;

      if (KEYWORDS.has(ident)) output += wrap('tok-kw', escapeHtml(ident));
      else if (TYPES.has(ident) || /^[A-Z]/.test(ident)) output += wrap('tok-type', escapeHtml(ident));
      else if (source[lookahead] === '(') output += wrap('tok-fn', escapeHtml(ident));
      else output += escapeHtml(ident);

      index = cursor;
      continue;
    }

    output += escapeHtml(ch);
    index += 1;
  }

  return output;
}
