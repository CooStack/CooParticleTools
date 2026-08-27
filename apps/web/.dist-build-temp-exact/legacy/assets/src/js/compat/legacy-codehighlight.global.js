// 简单 Kotlin 高亮：关键字 / 字符串 / 注释 / 数字 / 函数调用
(() => {
  function esc(s) {
    return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }

  const KEYWORDS = new Set([
    'package','import','class','object','interface','fun','val','var','const','lateinit',
    'if','else','when','for','while','do','break','continue','return','try','catch','finally','throw',
    'in','is','as','null','true','false','this','super',
    'public','private','protected','internal',
    'open','override','abstract','final','sealed','data','enum','annotation','companion',
    'typealias','where','by','get','set'
  ]);

  const TYPES = new Set([
    // Kotlin / JVM 常见内置类型
    'Any','Unit','Nothing',
    'Boolean','Byte','Short','Int','Long','Float','Double','Char','String',
    // 常见集合/容器
    'List','MutableList','Set','MutableSet','Map','MutableMap',
    'Pair','Triple','Array',
    // 常见原生数组
    'IntArray','LongArray','FloatArray','DoubleArray','BooleanArray','CharArray','ByteArray','ShortArray',
  
    // 兼容 Java/混写（也当成“类型”高亮）
    'void',
    'boolean',
    'byte',
    'short',
    'int',
    'long',
    'float',
    'double',
    'char',
    'Boolean',
    'Byte',
    'Short',
    'Integer',
    'Long',
    'Float',
    'Double',
    'Character',
    'MutableCollection',
    'Collection',
    'Iterable',
    'Sequence',
    'Optional',
    'HashMap',
    'HashSet',
    'ArrayList',
    'LinkedList',
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

  function wrap(cls, s) {
    return `<span class="${cls}">${s}</span>`;
  }

  function highlightKotlin(raw) {
    if (!raw) return '';
    const s = raw.replaceAll('\r\n','\n');
    let i = 0;
    let out = '';

    while (i < s.length) {
      const ch = s[i];
      const n2 = s.slice(i, i + 2);

      // line comment //
      if (n2 === '//' ) {
        const end = s.indexOf('\n', i);
        const piece = end === -1 ? s.slice(i) : s.slice(i, end);
        out += wrap('tok-com', esc(piece));
        i += piece.length;
        continue;
      }

      // block comment /* ... */
      if (n2 === '/*') {
        const end = s.indexOf('*/', i + 2);
        const piece = end === -1 ? s.slice(i) : s.slice(i, end + 2);
        out += wrap('tok-com', esc(piece));
        i += piece.length;
        continue;
      }

      // string "..."
      if (ch === '"') {
        let j = i + 1;
        let escaped = false;
        while (j < s.length) {
          const cj = s[j];
          if (escaped) {
            escaped = false;
          } else if (cj === '\\') {
            escaped = true;
          } else if (cj === '"') {
            j++;
            break;
          }
          j++;
        }
        const piece = s.slice(i, j);
        out += wrap('tok-str', esc(piece));
        i = j;
        continue;
      }

      // char literal 'a'
      if (ch === "'") {
        let j = i + 1;
        let escaped = false;
        while (j < s.length) {
          const cj = s[j];
          if (escaped) {
            escaped = false;
          } else if (cj === '\\') {
            escaped = true;
          } else if (cj === "'") {
            j++;
            break;
          }
          j++;
        }
        const piece = s.slice(i, j);
        out += wrap('tok-str', esc(piece));
        i = j;
        continue;
      }

      // number
      if (isDigit(ch)) {
        let j = i + 1;
        while (j < s.length && /[0-9._]/.test(s[j])) j++;
        const piece = s.slice(i, j);
        out += wrap('tok-num', esc(piece));
        i = j;
        continue;
      }

      // identifier / keyword / function call
      if (isIdentStart(ch)) {
        let j = i + 1;
        while (j < s.length && isIdentPart(s[j])) j++;
        const ident = s.slice(i, j);

        // peek non-space
        let k = j;
        while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++;

        if (KEYWORDS.has(ident)) {
          out += wrap('tok-kw', esc(ident));
        } else if (TYPES.has(ident) || /^[A-Z]/.test(ident)) {
          out += wrap('tok-type', esc(ident));
        } else if (s[k] === '(') {
          out += wrap('tok-fn', esc(ident));
        } else {
          out += esc(ident);
        }

        i = j;
        continue;
      }

      // default
      out += esc(ch);
      i++;
    }

    return out;
  }

  window.CodeHighlighter = { highlightKotlin };
})();
