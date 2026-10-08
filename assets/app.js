/* ============================================================
   JavaPath platform app
   Multi-course markdown renderer + dashboard + lesson reader.
   Works from file:// -- no fetch, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  var DATA = (window.COURSES && window.COURSES.courses) || [];
  var PAGE = (document.body.getAttribute('data-page') || '').toLowerCase();

  /* ------------------------------------------------------------ utils */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function param(name, def) {
    try {
      var v = new URLSearchParams(window.location.search).get(name);
      return v == null ? def : v;
    } catch (e) { return def; }
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }

  function courseById(id) {
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i];
    return null;
  }

  function loadCourses() {
    DATA.forEach(function (c) {
      c.sections.forEach(function (s) {
        s.part = s.part || null;
        s._plain = null;
        s._label = moduleLabel(s.title);
      });
    });
  }

  function moduleLabel(title) {
    var m = /^Module\s+([A-Za-z0-9]+)\b/.exec(title || '');
    return m ? m[1] : null;
  }

  /* ---------------------------------------------------------- progress */

  function getProgress() {
    try { return JSON.parse(lsGet('jp_progress') || '{}'); } catch (e) { return {}; }
  }
  function progressKey(course, idx) { return course.id + ':' + idx; }
  function isDone(course, idx) { return !!getProgress()[progressKey(course, idx)]; }
  function toggleDone(course, idx) {
    var p = getProgress();
    var k = progressKey(course, idx);
    if (p[k]) delete p[k]; else p[k] = 1;
    lsSet('jp_progress', JSON.stringify(p));
    return !!p[k];
  }
  function courseDone(course) {
    var n = 0;
    course.sections.forEach(function (s, i) { if (isDone(course, i)) n++; });
    return n;
  }
  function pct(done, total) { return total ? Math.round((done / total) * 100) : 0; }

  function saveLast(course, idx) {
    lsSet('jp_last', JSON.stringify({ c: course.id, s: idx, t: course.sections[idx].title }));
  }
  function getLast() {
    try { return JSON.parse(lsGet('jp_last') || 'null'); } catch (e) { return null; }
  }

  /* ------------------------------------------------- bookmarks + notes */

  function getBookmarks() {
    try { return JSON.parse(lsGet('jp_bookmarks') || '{}'); } catch (e) { return {}; }
  }
  function isBookmarked(course, idx) { return !!getBookmarks()[progressKey(course, idx)]; }
  function toggleBookmark(course, idx) {
    var b = getBookmarks(), k = progressKey(course, idx);
    if (b[k]) delete b[k]; else b[k] = 1;
    lsSet('jp_bookmarks', JSON.stringify(b));
    return !!b[k];
  }
  function getNotes() {
    try { return JSON.parse(lsGet('jp_notes') || '{}'); } catch (e) { return {}; }
  }
  function getNote(course, idx) { return getNotes()[progressKey(course, idx)] || ''; }
  function saveNote(course, idx, text) {
    var n = getNotes(), k = progressKey(course, idx);
    if (text && text.trim()) n[k] = text; else delete n[k];
    lsSet('jp_notes', JSON.stringify(n));
  }

  /* ============================================================
     Markdown -> HTML
     ============================================================ */

  var usedSlugs = {};

  function slugify(text) {
    return String(text || '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*?([^*]+)\*\*?/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'section';
  }

  function uniqueId(base) {
    var id = base, n = 2;
    while (usedSlugs[id]) { id = base + '-' + n; n++; }
    usedSlugs[id] = true;
    return id;
  }

  function inline(s) {
    var text = esc(s);
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      function (_, alt, src) { return '<img alt="' + alt + '" src="' + src + '">'; });
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
      function (_, label, href) { return '<a href="' + href + '">' + label + '</a>'; });
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + codes[+i] + '</code>';
    });
    return text;
  }

  function isFence(line) { return /^\s*(`{3,}|~{3,})/.test(line); }
  function isHeading(line) { return /^#{1,6}\s/.test(line); }
  function isHr(line) { return /^\s*([-*_])(\s*\1){2,}\s*$/.test(line); }
  function isQuote(line) { return /^\s*>\s?/.test(line); }
  function isList(line) { return /^\s*([-*+]|\d+\.)\s+/.test(line); }
  function isDetails(line) { return /^\s*<details\b/i.test(line); }
  function isSepRow(line) { return /-/.test(line) && /^\s*\|?[\s:|-]*\|?\s*$/.test(line); }

  function isBlockStart(line, next) {
    return isFence(line) || isHeading(line) || isHr(line) || isQuote(line) ||
      isList(line) || isDetails(line) || /^\s*</.test(line) ||
      (line.indexOf('|') >= 0 && next != null && isSepRow(next));
  }

  function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }

  function tableHTML(header, rows) {
    var h = '<table><thead><tr>' +
      header.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    h += rows.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return h + '</tbody></table>';
  }

  function headingHTML(text, level) {
    var id = uniqueId(slugify(text));
    return '<h' + level + ' id="' + id + '">' + inline(text) + '</h' + level + '>';
  }

  function codeBlockHTML(code, info) {
    var lang = (info || '').split(/\s+/)[0].toLowerCase();
    var label = lang || 'text';
    var lineCount = code.split('\n').length;
    var nums = '';
    for (var ln = 1; ln <= lineCount; ln++) nums += (ln > 1 ? '\n' : '') + ln;
    return '<div class="codeblock">' +
      '<div class="code-head">' +
      '<span class="cb-dots" aria-hidden="true"><i class="dot dot-r"></i><i class="dot dot-y"></i><i class="dot dot-g"></i></span>' +
      '<span class="cb-lang">' + esc(label) + '</span>' +
      '<span class="cb-spacer"></span>' +
      '<button class="cb-copy" type="button" aria-label="Copy code">' +
      '<i class="fa-regular fa-copy cb-ico" aria-hidden="true"></i>' +
      '<span class="cb-label">Copy</span></button>' +
      '</div>' +
      '<div class="code-body">' +
      '<div class="ln-gutter" aria-hidden="true">' + nums + '</div>' +
      '<pre class="code" data-lang="' + esc(label) + '"><code>' + highlight(code, lang) + '</code></pre>' +
      '</div>' +
      '</div>';
  }

  function calloutClass(text) {
    if (/\u26a0/.test(text)) return 'warning';
    if (/\u{1F4A1}/u.test(text)) return 'tip';
    if (/\u{1F512}/u.test(text)) return 'security';
    if (/\u{1F3ED}/u.test(text)) return 'prod';
    if (/\u{1F4CC}/u.test(text)) return 'concept';
    return 'note';
  }

  var EMOJI_LEAD = /^(?:[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u200D]|[\uD83C-\uD83F][\uDC00-\uDFFF])+\s*/;

  function renderBlockquote(lines) {
    var raw = lines.join('\n');
    var cls = calloutClass(raw);
    var cleaned = lines.slice();
    for (var k = 0; k < cleaned.length; k++) {
      if (cleaned[k].trim()) { cleaned[k] = cleaned[k].replace(EMOJI_LEAD, ''); break; }
    }
    return '<blockquote class="callout ' + cls + '">' + renderBlocks(cleaned) + '</blockquote>';
  }

  function detailsClass(summary) {
    if (/solution/i.test(summary)) return 'solution';
    if (/answer|quiz|check|expected|watch|interpret|reveal/i.test(summary)) return 'quiz';
    return '';
  }

  function renderDetails(block) {
    var m = /<summary>([\s\S]*?)<\/summary>/i.exec(block);
    var summaryText = m ? m[1] : 'Details';
    var inner = block
      .replace(/<details\b[^>]*>/i, '')
      .replace(/<\/details>\s*$/i, '')
      .replace(/<summary>[\s\S]*?<\/summary>/i, '');
    var cls = detailsClass(summaryText);
    return '<details' + (cls ? ' class="' + cls + '"' : '') + '>' +
      '<summary>' + inline(summaryText) + '</summary>\n' +
      renderBlocks(inner.split('\n')) +
      '\n</details>';
  }

  function renderList(lines) {
    var src = lines.map(function (l) {
      var m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(l);
      if (m) return { indent: m[1].replace(/\t/g, '    ').length, ordered: /\d/.test(m[2]), text: m[3], item: true };
      return { indent: (l.match(/^\s*/)[0] || '').replace(/\t/g, '    ').length, text: l.trim(), item: false };
    });
    var pos = 0;

    function build(indent) {
      var ordered = null, html = '';
      while (pos < src.length) {
        var it = src[pos];
        if (!it.item) { pos++; continue; }
        if (it.indent < indent) break;
        if (it.indent > indent) break;
        if (ordered === null) ordered = it.ordered;
        pos++;
        var text = it.text, checked = null;
        var cm = /^\[([ xX])\]\s+(.*)$/.exec(text);
        if (cm) { checked = cm[1].toLowerCase() === 'x'; text = cm[2]; }
        var cont = [];
        while (pos < src.length && !src[pos].item && src[pos].indent > indent) { cont.push(src[pos].text); pos++; }
        var inner = inline(text);
        if (cont.length) inner += ' ' + inline(cont.join(' '));
        if (pos < src.length && src[pos].item && src[pos].indent > indent) {
          inner += build(src[pos].indent);
        }
        if (checked !== null) {
          html += '<li class="task"><input type="checkbox" disabled' + (checked ? ' checked' : '') + '> ' + inner + '</li>';
        } else {
          html += '<li>' + inner + '</li>';
        }
      }
      return '<' + (ordered ? 'ol' : 'ul') + '>' + html + '</' + (ordered ? 'ol' : 'ul') + '>';
    }

    if (!src.length) return '';
    return build(src[0].indent);
  }

  function renderBlocks(lines) {
    var out = [], i = 0, n = lines.length;
    while (i < n) {
      var line = lines[i];

      if (isFence(line)) {
        var info = (/^\s*(`{3,}|~{3,})(.*)$/.exec(line) || [])[2] || '';
        var lang = (info.split(/\s+/)[0] || '').toLowerCase();
        var code = [];
        i++;
        if (lang === 'markdown' || lang === 'md') {
          var inner = 0;
          while (i < n) {
            if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[i])) {
              if (inner > 0) { inner--; code.push(lines[i]); i++; continue; }
              break;
            }
            if (/^\s*(`{3,}|~{3,})\s*\S/.test(lines[i])) { inner++; }
            code.push(lines[i]); i++;
          }
          i++;
        } else {
          while (i < n && !/^\s*(`{3,}|~{3,})\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
          i++;
        }
        out.push(codeBlockHTML(code.join('\n'), info.trim()));
        continue;
      }

      if (/^\s*$/.test(line)) { i++; continue; }

      if (isDetails(line)) {
        var depth = 0, buf = [];
        while (i < n) {
          var l = lines[i];
          if (/<details\b/i.test(l)) depth++;
          if (/<\/details>/i.test(l)) depth--;
          buf.push(l);
          i++;
          if (depth <= 0) break;
        }
        out.push(renderDetails(buf.join('\n')));
        continue;
      }

      if (/^\s*</.test(line)) {
        var raw = [];
        while (i < n && !/^\s*$/.test(lines[i])) { raw.push(lines[i]); i++; }
        out.push(raw.join('\n'));
        continue;
      }

      var hm = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
      if (hm) { out.push(headingHTML(hm[2], hm[1].length)); i++; continue; }

      if (isHr(line)) { out.push('<hr>'); i++; continue; }

      if (line.indexOf('|') >= 0 && i + 1 < n && isSepRow(lines[i + 1])) {
        var header = splitRow(line);
        i += 2;
        var rows = [];
        while (i < n && lines[i].indexOf('|') >= 0 && !/^\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        out.push(tableHTML(header, rows));
        continue;
      }

      if (isQuote(line)) {
        var bq = [];
        while (i < n && isQuote(lines[i])) { bq.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push(renderBlockquote(bq));
        continue;
      }

      if (isList(line)) {
        var lb = [];
        while (i < n && (isList(lines[i]) ||
          (/^\s{2,}\S/.test(lines[i]) && !/^\s*$/.test(lines[i]) && !isFence(lines[i])))) {
          lb.push(lines[i]); i++;
        }
        out.push(renderList(lb));
        continue;
      }

      var p = [line];
      i++;
      while (i < n && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i], lines[i + 1])) {
        p.push(lines[i]); i++;
      }
      out.push('<p>' + inline(p.join('\n').replace(/\n/g, ' ')) + '</p>');
    }
    return out.join('\n');
  }

  function renderMarkdown(src) {
    usedSlugs = {};
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    return renderBlocks(lines);
  }

  /* ---------------------------------------------- syntax highlighting */

  var JAVA_KW = 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield|record|sealed|permits|true|false|null';
  var SQL_KW = 'select|insert|update|delete|from|where|join|inner|left|right|full|outer|cross|on|group|by|order|having|limit|offset|fetch|next|rows|only|create|alter|drop|truncate|table|index|view|materialized|primary|key|foreign|references|unique|not|null|default|and|or|in|exists|between|like|ilike|is|as|distinct|union|all|any|some|case|when|then|else|end|cast|coalesce|nullif|constraint|check|cascade|returning|with|recursive|over|partition|rows|range|preceding|following|unbounded|current|row|explain|analyze|verbose|begin|commit|rollback|transaction|serializable|conflict|do|nothing|values|set|using|grant|revoke|if|int|integer|bigint|smallint|serial|bigserial|text|varchar|char|boolean|uuid|timestamp|timestamptz|date|time|numeric|decimal|real|double|precision|json|jsonb|bytea|array|interval|concat|substring|aggregate|window|filter|within|lateral|cross';

  var HL = {};
  HL.java = {
    re: new RegExp(
      '(\\/\\*[\\s\\S]*?\\*\\/)|(\\/\\/[^\\n]*)|("(?:\\\\[\\s\\S]|[^"\\\\\\n])*"?|\'(?:\\\\[\\s\\S]|[^\'\\\\\\n])*\'?)' +
      '|(@[A-Za-z_][\\w.]*)|(\\b\\d[\\d_]*(?:\\.\\d+)?[fFdDlL]?\\b)|\\b(' + JAVA_KW + ')\\b|\\b([A-Z][A-Za-z0-9_]*)\\b', 'g'),
    cls: ['comment', 'comment', 'string', 'annotation', 'number', 'keyword', 'type']
  };
  HL.sql = {
    re: new RegExp(
      '(--[^\\n]*)|(\\/\\*[\\s\\S]*?\\*\\/)|(\'(?:\'\'|[^\'])*\'?)|(\\b\\d+(?:\\.\\d+)?\\b)|\\b(' + SQL_KW + ')\\b', 'gi'),
    cls: ['comment', 'comment', 'string', 'number', 'keyword']
  };
  HL.bash = {
    re: /(#[^\n]*)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\$[A-Za-z_]\w*|\$\{[^}]*\})|(\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|echo|cd|exit|set|trap|alias|sudo|apt|apt-get|brew|docker|compose|git|mvn|mvnw|npm|npx|curl|wget|mkdir|rm|cp|mv|chmod|chown|grep|sed|awk|cat|ls|pwd|tar|unzip|make|java|javac|psql|kc|kubectl|helm|systemctl|service|nginx|python|pip|node|yarn|pnpm)\b)|(\b\d+(?:\.\d+)?\b)/g,
    cls: ['comment', 'string', 'var', 'keyword', 'number']
  };
  HL.powershell = {
    re: /(#[^\n]*)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\$[A-Za-z_]\w*|\$\{[^}]*\})|([A-Za-z]+-[A-Za-z][\w]*)|(\b(?:if|else|elseif|foreach|foreach-object|while|do|function|return|param|begin|process|end|try|catch|finally|throw|switch|break|continue|Get|Set|New|Remove|Write|Select|Where|ForEach)\b)|(\b\d+(?:\.\d+)?\b)/gi,
    cls: ['comment', 'string', 'var', 'type', 'keyword', 'number']
  };
  HL.json = {
    re: /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)/g,
    cls: ['key', 'string', 'number', 'keyword']
  };
  HL.yaml = {
    re: /(#[^\n]*)|(^[ \t-]*[\w.'"/@+*-][\w.'"/@+*-]*(?=\s*:))|("(?:\\.|[^"\\])*"|'(?:''|[^'])*')|(\b\d+(?:\.\d+)?\b)|(\b(?:true|false|null|yes|no|on|off)\b)/gm,
    cls: ['comment', 'key', 'string', 'number', 'keyword']
  };
  HL.xml = {
    re: /(<!--[\s\S]*?-->)|(<\/?[\w:.-]+|\/?>)|([\w:.-]+)(?=\s*=)|("(?:[^"]*)"|'(?:[^']*)')/g,
    cls: ['comment', 'key', 'attr', 'string']
  };
  HL.properties = {
    re: /(#[^\n]*|![^\n]*)|(^[ \t]*[\w.\-[\]]+(?=\s*[=:]))|(".*?"|'.*?')|(\b\d+(?:\.\d+)?\b)/gm,
    cls: ['comment', 'key', 'string', 'number']
  };
  HL.dockerfile = {
    re: /(#[^\n]*)|(^\s*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b)|(".*?"|'.*?')/gim,
    cls: ['comment', 'keyword', 'string']
  };
  HL.diff = {
    re: /(^[+-]{3} .*$|^@@[^\n]*$)|(^\+[^\n]*$)|(^-[^\n]*$)/gm,
    cls: ['meta', 'add', 'del']
  };
  HL.markdown = {
    re: /(^[ \t]*#{1,6} [^\n]*)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\n]+\))/gm,
    cls: ['key', 'keyword', 'string', 'attr']
  };
  HL.http = {
    re: /(#[^\n]*|\/\/[^\n]*)|(^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)|(\{\{[\w.]+\}\})|(https?:\/\/[^\s"']+)|(\b\d{3}\b)/gm,
    cls: ['comment', 'keyword', 'var', 'string', 'number']
  };
  HL.gitignore = {
    re: /(#[^\n]*)|(^!.*$)|(^\*?\*?\.?[\w./*-]+$)/gm,
    cls: ['comment', 'keyword', 'string']
  };
  HL.javascript = {
    re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|super|import|export|from|async|await|try|catch|finally|throw|typeof|instanceof|this|of|in|yield|delete|void|null|undefined|true|false)\b)|(\b\d+(?:\.\d+)?\b)|(@[A-Za-z_]\w*)/g,
    cls: ['comment', 'string', 'keyword', 'number', 'annotation']
  };
  HL.makefile = {
    re: /(#[^\n]*)|(^[\w./%-]+(?=\s*:))|(\$\([^)]*\))/gm,
    cls: ['comment', 'key', 'var']
  };
  HL.nginx = {
    re: /(#[^\n]*)|(\b(?:server|location|listen|server_name|root|index|proxy_pass|try_files|if|return|rewrite|add_header|error_page|upstream|include|worker_processes|events|http|gzip|ssl_certificate)\b)|(".*?")/g,
    cls: ['comment', 'keyword', 'string']
  };

  var ALIAS = {
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', bashrc: 'bash',
    ps1: 'powershell', ps: 'powershell', pwsh: 'powershell',
    yml: 'yaml', kt: 'java', kts: 'java', groovy: 'java',
    htm: 'xml', html: 'xml', xhtml: 'xml', svg: 'xml',
    ini: 'properties', conf: 'properties', cfg: 'properties', env: 'properties', dotenv: 'properties', toml: 'properties',
    dockerignore: 'gitignore', gitattributes: 'gitignore',
    js: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
    jsonc: 'json', json5: 'json',
    docker: 'dockerfile', postgres: 'sql', postgresql: 'sql', plpgsql: 'sql',
    md: 'markdown', mk: 'makefile', 'make': 'makefile', nginxconf: 'nginx'
  };

  function highlight(code, lang) {
    lang = (lang || '').toLowerCase().trim();
    lang = ALIAS[lang] || lang;
    var spec = HL[lang];
    if (!spec) return esc(code);
    var re = spec.re;
    re.lastIndex = 0;
    var out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      if (m.index === re.lastIndex) re.lastIndex++;
      if (m[0] === '') { re.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      var cls = null;
      for (var g = 1; g <= spec.cls.length; g++) {
        if (m[g] !== undefined) { cls = spec.cls[g - 1]; break; }
      }
      out += cls ? '<span class="tok-' + cls + '">' + esc(m[0]) + '</span>' : esc(m[0]);
      last = re.lastIndex;
    }
    out += esc(code.slice(last));
    return out;
  }

  /* ---------------------------------------------------------- copy/TOC */

  function bindCopy(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.cb-copy') : null;
      if (!btn) return;
      var block = btn.closest('.codeblock');
      var codeEl = block && block.querySelector('pre code');
      if (!codeEl) return;
      var text = codeEl.textContent;
      var label = btn.querySelector('.cb-label') || btn;
      var ico = btn.querySelector('.cb-ico');
      function done() {
        label.textContent = 'Copied';
        if (ico) ico.className = 'fa-solid fa-check cb-ico';
        btn.classList.add('copied');
        setTimeout(function () {
          label.textContent = 'Copy';
          if (ico) ico.className = 'fa-regular fa-copy cb-ico';
          btn.classList.remove('copied');
        }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    });
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { /* ignore */ }
  }

  function buildTOC(container) {
    var heads = $$('h2, h3', container);
    if (heads.length < 2) return null;
    var items = heads.map(function (h) {
      return '<li><a href="#' + h.id + '">' + h.textContent.replace(/^[#\s]+/, '') + '</a></li>';
    }).join('');
    var details = document.createElement('details');
    details.className = 'toc';
    details.innerHTML = '<summary>On this page (' + heads.length + ')</summary><ul>' + items + '</ul>';
    return details;
  }

  /* ---------------------------------------------------------- theme */

  function initTheme() {
    var saved = lsGet('jp_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    function paint() {
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      $$('.theme-toggle').forEach(function (btn) {
        var i = btn.querySelector('i');
        if (i) i.className = 'fa-solid ' + (light ? 'fa-sun' : 'fa-moon');
      });
    }
    paint();
    $$('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', cur);
        lsSet('jp_theme', cur);
        paint();
      });
    });
  }

  function initDrawer() {
    var burger = document.getElementById('hamburger');
    var overlay = document.getElementById('overlay');
    function close() { document.body.classList.remove('drawer-open'); }
    if (burger) burger.addEventListener('click', function () { document.body.classList.toggle('drawer-open'); });
    if (overlay) overlay.addEventListener('click', close);
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.sidebar .nav-item')) close();
    });
  }

  function initNavFilter() {
    var input = document.getElementById('nav-filter');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      $$('#sidebar-nav .nav-item').forEach(function (a) {
        var hit = !q || a.textContent.toLowerCase().indexOf(q) >= 0;
        a.style.display = hit ? '' : 'none';
      });
      $$('#sidebar-nav .nav-group').forEach(function (g) {
        var any = $$('.nav-item', g).some(function (a) { return a.style.display !== 'none'; });
        g.style.display = any ? '' : 'none';
      });
    });
  }

  /* ---------------------------------------------------- plain text */

  function stripMarkdown(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~|]/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plainOf(course, idx) {
    var s = course.sections[idx];
    if (s._plain == null) s._plain = stripMarkdown(s.body);
    return s._plain;
  }

  function readMinutes(body) {
    var words = String(body || '').split(/\s+/).length;
    return Math.max(1, Math.round(words / 200));
  }

  function minutesFor(course) {
    var chars = 0;
    course.sections.forEach(function (s) { chars += s.body.length; });
    return Math.max(1, Math.round((chars / 6) / 200));
  }

  function snippetOf(course, idx) {
    var raw = course.sections[idx].body.slice(0, 500);
    return stripMarkdown(raw).slice(0, 110);
  }

  function snippetAround(text, q) {
    var lc = text.toLowerCase();
    var at = q ? lc.indexOf(q.toLowerCase()) : -1;
    if (at < 0) return esc(text.slice(0, 160)) + (text.length > 160 ? '\u2026' : '');
    var start = Math.max(0, at - 60);
    var end = Math.min(text.length, at + q.length + 100);
    var pre = start > 0 ? '\u2026' : '';
    var post = end < text.length ? '\u2026' : '';
    return pre + highlightTerm(esc(text.slice(start, end)), q) + post;
  }

  function highlightTerm(html, q) {
    if (!q) return html;
    try {
      var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      return html.replace(re, '<mark>$1</mark>');
    } catch (e) { return html; }
  }

  /* ============================================================ INDEX */

  function initIndex() {
    var totalSections = 0, totalLines = 0, totalChars = 0, moduleCount = 0;
    DATA.forEach(function (c) {
      totalSections += c.sections.length;
      c.sections.forEach(function (s) {
        totalLines += (s.body.match(/\n/g) || []).length + 1;
        totalChars += s.body.length;
        if (s._label) moduleCount++;
      });
    });
    var hours = Math.max(1, Math.round((totalChars / 6) / 200 / 60));

    setText('stat-courses', DATA.length);
    setText('stat-sections', totalSections);
    setText('stat-lines', Math.round(totalLines / 1000) + 'k');
    setText('stat-hours', hours + 'h');

    /* progress */
    var allSections = [];
    DATA.forEach(function (c) { c.sections.forEach(function (s, i) { allSections.push([c, i]); }); });
    var doneTotal = 0;
    allSections.forEach(function (p) { if (isDone(p[0], p[1])) doneTotal++; });
    var fill = document.getElementById('prog-fill');
    if (fill) fill.style.width = pct(doneTotal, allSections.length) + '%';
    setText('prog-text', doneTotal + ' / ' + allSections.length + ' sections completed');

    /* resume button */
    var last = getLast();
    var resume = document.getElementById('btn-resume');
    if (resume && last && courseById(last.c)) {
      resume.href = 'lesson.html?c=' + encodeURIComponent(last.c) + '&s=' + last.s;
      resume.style.display = '';
      resume.innerHTML = '<i class="fa-solid fa-circle-play"></i> Resume: ' + esc(last.t.slice(0, 34)) + (last.t.length > 34 ? '\u2026' : '');
    }
    var start = document.getElementById('btn-start');
    if (start) {
      var firstCourse = DATA[0];
      var firstIdx = firstModuleIndex(firstCourse);
      start.href = 'lesson.html?c=' + encodeURIComponent(firstCourse.id) + '&s=' + firstIdx;
    }

    renderCourseGrid();
    renderBrowse();
    renderBookmarks();

    var search = document.getElementById('search');
    if (search) initSearch(search);
  }

  function firstModuleIndex(course) {
    for (var i = 0; i < course.sections.length; i++) if (course.sections[i]._label) return i;
    return 0;
  }

  function renderCourseGrid() {
    var grid = document.getElementById('course-grid');
    if (!grid) return;
    grid.innerHTML = DATA.map(function (c) {
      var done = courseDone(c);
      var mods = c.sections.filter(function (s) { return s._label; }).length;
      var meta = mods ? (mods + ' modules') : (c.sections.length + ' sections');
      var tags = courseTags(c);
      return '<a class="card course-card" href="course.html?c=' + encodeURIComponent(c.id) + '">' +
        '<div class="cc-top">' +
        '<span class="cc-mark" style="background:linear-gradient(135deg,' + c.accent + ',#ff7a45)">' + esc(initials(c.title)) + '</span>' +
        '<div><h3>' + esc(c.title) + '</h3>' +
        '<div class="cc-features">' + tags + '</div></div>' +
        '</div>' +
        '<p class="cc-sub">' + esc(c.subtitle) + '</p>' +
        '<div class="cc-progress">' +
        '<div class="cc-line"><span>' + meta + '</span><span>' + done + ' / ' + c.sections.length + ' done</span></div>' +
        '<div class="bar"><i style="width:' + pct(done, c.sections.length) + '%"></i></div>' +
        '</div></a>';
    }).join('');
  }

  function courseTags(c) {
    var tags = [];
    var mods = c.sections.filter(function (s) { return s._label; }).length;
    if (mods) tags.push(mods + ' modules');
    var parts = distinctParts(c);
    if (parts.length) tags.push(parts.length + ' parts');
    tags.push(c.sections.length + ' sections');
    tags.push(minutesFor(c) + ' min');
    return tags.slice(0, 3).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
  }

  function initials(title) {
    var m = /([A-Za-z]+)/.exec(title.split(':')[0]);
    return m ? m[1].slice(0, 2).toUpperCase() : 'JP';
  }

  function distinctParts(course) {
    var seen = {}, out = [];
    course.sections.forEach(function (s) {
      if (s.part && !seen[s.part]) { seen[s.part] = true; out.push(s.part); }
    });
    return out;
  }

  function sectionCard(course, idx) {
    var s = course.sections[idx];
    var label = s._label || (s.part ? partShort(s.part) : '\u00A7');
    var done = isDone(course, idx);
    return '<a class="card' + (done ? ' done' : '') + '" href="lesson.html?c=' + encodeURIComponent(course.id) + '&s=' + idx + '">' +
      (done ? '<span class="badge-done">done</span>' : '') +
      '<span class="num">' + esc(label) + '</span>' +
      '<h3>' + esc(cleanTitle(s.title)) + '</h3>' +
      '<span class="snippet">' + esc(snippetOf(course, idx)) + '\u2026</span>' +
      '<div class="meta"><span>' + readMinutes(s.body) + ' min read</span><span>' + s.body.length.toLocaleString() + ' chars</span></div>' +
      '</a>';
  }

  function partShort(part) {
    var m = /^(PART|SECTION)\s+([A-Za-z0-9]+)/i.exec(part);
    return m ? (m[1].toUpperCase() === 'PART' ? 'P' : 'S') + m[2] : part.slice(0, 3).toUpperCase();
  }

  function cleanTitle(t) {
    return String(t).replace(/\s*`\[[^\]]*\]`\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  function renderBrowse() {
    var host = document.getElementById('browse');
    if (!host) return;
    var html = '';
    DATA.forEach(function (c) {
      var parts = distinctParts(c);
      html += '<div class="browse-course">';
      html += '<div class="group-head"><h2>' + esc(c.title) + '</h2>' +
        '<a class="g-count" href="course.html?c=' + encodeURIComponent(c.id) + '">open course \u2192</a></div>';
      if (parts.length) {
        parts.forEach(function (p) {
          var items = [];
          c.sections.forEach(function (s, i) { if (s.part === p) items.push(sectionCard(c, i)); });
          html += '<div class="group-head"><h3 style="font-size:1rem">' + esc(cleanTitle(p)) + '</h3>' +
            '<span class="g-count">' + items.length + ' sections</span></div>';
          html += '<div class="grid">' + items.join('') + '</div>';
        });
        var loose = [];
        c.sections.forEach(function (s, i) { if (!s.part) loose.push(sectionCard(c, i)); });
        if (loose.length) html += '<div class="grid" style="margin-top:12px">' + loose.join('') + '</div>';
      } else {
        html += '<div class="grid">' + c.sections.map(function (s, i) { return sectionCard(c, i); }).join('') + '</div>';
      }
      html += '</div>';
    });
    host.innerHTML = html;
  }

  function renderBookmarks() {
    var anchor = document.getElementById('courses');
    if (!anchor || !anchor.parentNode) return;
    var existing = document.getElementById('bookmarks-label');
    if (existing) existing.parentNode.removeChild(existing);
    var host = document.getElementById('bookmarks');
    if (host) host.parentNode.removeChild(host);

    var items = [];
    DATA.forEach(function (c) {
      c.sections.forEach(function (s, i) { if (isBookmarked(c, i)) items.push(sectionCard(c, i)); });
    });
    if (!items.length) return;

    var label = document.createElement('p');
    label.className = 'section-label';
    label.id = 'bookmarks-label';
    label.textContent = 'Your bookmarks (' + items.length + ')';
    anchor.parentNode.insertBefore(label, anchor);

    var sec = document.createElement('section');
    sec.id = 'bookmarks';
    sec.className = 'grid';
    sec.innerHTML = items.join('');
    anchor.parentNode.insertBefore(sec, anchor);
  }

  function initSearch(input) {
    var results = document.getElementById('results');
    var meta = document.getElementById('search-meta');
    var browse = document.getElementById('browse');
    var sectionsLabel = document.getElementById('browse-label');
    var timer = null;

    function run() {
      var q = input.value.trim();
      if (q.length < 2) {
        if (results) results.innerHTML = '';
        if (meta) meta.textContent = '';
        if (browse) browse.style.display = '';
        if (sectionsLabel) sectionsLabel.style.display = '';
        return;
      }
      var hits = searchAll(q);
      if (browse) browse.style.display = 'none';
      if (sectionsLabel) sectionsLabel.style.display = 'none';
      if (meta) meta.textContent = hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for \u201C' + q + '\u201D';
      if (!results) return;
      if (!hits.length) {
        results.innerHTML = '<div class="empty">No matches. Try another term.</div>';
        return;
      }
      results.innerHTML = hits.slice(0, 80).map(function (h) {
        return '<a class="result" href="lesson.html?c=' + encodeURIComponent(h.course.id) + '&s=' + h.idx + '">' +
          '<div class="r-top"><span class="r-course">' + esc(h.course.title) + '</span>' +
          '<span class="r-title">' + highlightTerm(esc(cleanTitle(h.section.title)), q) + '</span></div>' +
          '<div class="r-snippet">' + snippetAround(h.text, q) + '</div></a>';
      }).join('');
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(run, 160);
    });
  }

  function searchAll(q) {
    var lq = q.toLowerCase(), out = [];
    DATA.forEach(function (c) {
      c.sections.forEach(function (s, i) {
        var text = plainOf(c, i);
        var titleHit = s.title.toLowerCase().indexOf(lq) >= 0;
        var bodyHit = text.toLowerCase().indexOf(lq) >= 0;
        if (titleHit || bodyHit) out.push({ course: c, section: s, idx: i, text: text, titleHit: titleHit });
      });
    });
    out.sort(function (a, b) { return (b.titleHit ? 1 : 0) - (a.titleHit ? 1 : 0); });
    return out;
  }

  /* ============================================================ COURSE */

  function initCourse() {
    var id = param('c', DATA[0] && DATA[0].id);
    var course = courseById(id) || DATA[0];
    if (!course) return;

    document.title = course.title + ' \u00B7 JavaPath';
    setText('course-title', course.title);
    setText('course-subtitle', course.subtitle);
    var crumb = document.getElementById('course-crumb');
    if (crumb) crumb.textContent = course.title;

    var mark = document.getElementById('course-mark');
    if (mark) { mark.textContent = initials(course.title); mark.style.background = 'linear-gradient(135deg,' + course.accent + ',#ff7a45)'; }

    var done = courseDone(course);
    setText('course-progress-text', done + ' / ' + course.sections.length + ' sections completed');
    var fill = document.getElementById('course-prog-fill');
    if (fill) fill.style.width = pct(done, course.sections.length) + '%';

    var mods = course.sections.filter(function (s) { return s._label; }).length;
    setText('course-meta', (mods ? mods + ' modules \u00B7 ' : '') + course.sections.length + ' sections \u00B7 ' + minutesFor(course) + ' min read');

    var host = document.getElementById('course-body');
    if (!host) return;
    var parts = distinctParts(course);
    var html = '';
    if (parts.length) {
      parts.forEach(function (p) {
        var items = [];
        course.sections.forEach(function (s, i) { if (s.part === p) items.push(sectionCard(course, i)); });
        html += '<div class="group-head"><h2>' + esc(cleanTitle(p)) + '</h2><span class="g-count">' + items.length + ' sections</span></div>';
        html += '<div class="grid">' + items.join('') + '</div>';
      });
      var loose = [];
      course.sections.forEach(function (s, i) { if (!s.part) loose.push(sectionCard(course, i)); });
      if (loose.length) html += '<div class="group-head"><h2>Introduction</h2></div><div class="grid">' + loose.join('') + '</div>';
    } else {
      var modules = [], extras = [];
      course.sections.forEach(function (s, i) { (s._label ? modules : extras).push(sectionCard(course, i)); });
      if (modules.length) {
        html += '<div class="group-head"><h2>Modules</h2><span class="g-count">' + modules.length + '</span></div>';
        html += '<div class="grid">' + modules.join('') + '</div>';
      }
      if (extras.length) {
        html += '<div class="group-head"><h2>Extras</h2><span class="g-count">' + extras.length + '</span></div>';
        html += '<div class="grid">' + extras.join('') + '</div>';
      }
    }
    host.innerHTML = html;
  }

  /* ============================================================ LESSON */

  function initLesson() {
    var id = param('c', DATA[0] && DATA[0].id);
    var course = courseById(id) || DATA[0];
    if (!course) return;
    var idx = parseInt(param('s', '0'), 10);
    if (isNaN(idx) || idx < 0 || idx >= course.sections.length) idx = 0;
    var section = course.sections[idx];

    document.title = section.title + ' \u00B7 ' + course.title;
    setText('article-title', cleanTitle(section.title));
    setText('crumb-title', cleanTitle(section.title));
    var crumbCourse = document.getElementById('crumb-course');
    if (crumbCourse) { crumbCourse.textContent = course.title; crumbCourse.href = 'course.html?c=' + encodeURIComponent(course.id); }

    var bodyEl = document.getElementById('article-body');
    if (bodyEl) {
      bodyEl.className = 'course';
      bodyEl.innerHTML = renderMarkdown(section.body);
      bodyEl.insertBefore(document.createComment('rendered'), bodyEl.firstChild);
      var toc = buildTOC(bodyEl);
      if (toc) bodyEl.parentNode.insertBefore(toc, bodyEl);
    }

    renderSidebar(course, idx);
    renderPager(course, idx);
    initComplete(course, idx);
    initLessonTools(course, idx);
    saveLast(course, idx);
    initCourseSelect(course);
    scrollToHash();
  }

  function renderSidebar(course, activeIdx) {
    var nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    var parts = distinctParts(course);
    var html = '';

    if (parts.length) {
      var looseCount = course.sections.filter(function (s) { return !s.part; }).length;
      if (looseCount) html += '<div class="nav-group"><p>Introduction</p>' + buildPartItems(course, null, activeIdx) + '</div>';
      parts.forEach(function (p) {
        html += '<div class="nav-group"><p>' + esc(cleanTitle(p)) + '</p>' + buildPartItems(course, p, activeIdx) + '</div>';
      });
    } else {
      html += '<div class="nav-group"><p>' + esc(course.title) + '</p>' + buildPartItems(course, null, activeIdx) + '</div>';
    }
    nav.innerHTML = html;
  }

  function buildPartItems(course, part, activeIdx) {
    var out = '';
    course.sections.forEach(function (s, i) {
      if (s.part !== part) return;
      var label = s._label || partShort(part || '') || String(i + 1);
      var done = isDone(course, i);
      out += '<a class="nav-item' + (i === activeIdx ? ' active' : '') + (done ? ' done' : '') + (isBookmarked(course, i) ? ' bookmarked' : '') +
        '" href="lesson.html?c=' + encodeURIComponent(course.id) + '&s=' + i + '">' +
        '<span class="n">' + esc(label) + '</span><span class="t">' + esc(cleanTitle(s.title)) + '</span>' +
        (isBookmarked(course, i) ? '<span class="nav-star" title="Bookmarked"><i class="fa-solid fa-bookmark"></i></span>' : '') + '</a>';
    });
    return out;
  }

  function initCourseSelect(course) {
    var sel = document.getElementById('course-select');
    if (!sel) return;
    sel.innerHTML = DATA.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === course.id ? ' selected' : '') + '>' + esc(c.title) + '</option>';
    }).join('');
    sel.addEventListener('change', function () {
      window.location.href = 'course.html?c=' + encodeURIComponent(sel.value);
    });
  }

  function renderPager(course, idx) {
    var pager = document.getElementById('pager');
    if (!pager) return;
    var prev = idx > 0 ? course.sections[idx - 1] : null;
    var next = idx < course.sections.length - 1 ? course.sections[idx + 1] : null;
    var prevHTML = prev
      ? '<a href="lesson.html?c=' + encodeURIComponent(course.id) + '&s=' + (idx - 1) + '"><span class="dir">\u2190 Previous</span>' + esc(cleanTitle(prev.title)) + '</a>'
      : '<span class="disabled"><span class="dir">\u2190 Previous</span>Start of course</span>';
    var nextHTML = next
      ? '<a class="next" href="lesson.html?c=' + encodeURIComponent(course.id) + '&s=' + (idx + 1) + '"><span class="dir">Next \u2192</span>' + esc(cleanTitle(next.title)) + '</a>'
      : '<span class="next disabled"><span class="dir">Next \u2192</span>End of course</span>';
    pager.innerHTML = prevHTML + nextHTML;
  }

  function initComplete(course, idx) {
    var btn = document.getElementById('btn-complete');
    if (!btn) return;
    btn.style.display = '';
    function paint() {
      var done = isDone(course, idx);
      btn.classList.toggle('done', done);
      btn.innerHTML = done
        ? '<i class="fa-solid fa-circle-check"></i> Completed'
        : '<i class="fa-regular fa-circle-check"></i> Mark as complete';
    }
    paint();
    btn.addEventListener('click', function () {
      toggleDone(course, idx);
      paint();
      var navItem = $('#sidebar-nav .nav-item.active');
      if (navItem) navItem.classList.toggle('done', isDone(course, idx));
    });
  }

  function initLessonTools(course, idx) {
    var head = $('.article-head');
    if (head) {
      var actions = document.createElement('div');
      actions.className = 'article-actions';

      var bm = document.createElement('button');
      bm.type = 'button';
      bm.className = 'btn btn-ghost tool-btn';

      var pr = document.createElement('button');
      pr.type = 'button';
      pr.className = 'btn btn-ghost tool-btn';
      pr.innerHTML = '<i class="fa-solid fa-print"></i> Print / PDF';
      pr.addEventListener('click', function () { window.print(); });

      function paint() {
        var on = isBookmarked(course, idx);
        bm.classList.toggle('bookmarked', on);
        bm.innerHTML = (on ? '<i class="fa-solid fa-bookmark"></i> Bookmarked' : '<i class="fa-regular fa-bookmark"></i> Bookmark');
      }
      bm.addEventListener('click', function () {
        var on = toggleBookmark(course, idx);
        paint();
        var ni = $('#sidebar-nav .nav-item.active');
        if (!ni) return;
        ni.classList.toggle('bookmarked', on);
        var ex = ni.querySelector('.nav-star');
        if (on && !ex) {
          var sp = document.createElement('span');
          sp.className = 'nav-star';
          sp.title = 'Bookmarked';
          sp.innerHTML = '<i class="fa-solid fa-bookmark"></i>';
          ni.appendChild(sp);
        } else if (!on && ex) {
          ex.parentNode.removeChild(ex);
        }
      });
      paint();
      actions.appendChild(bm);
      actions.appendChild(pr);
      head.appendChild(actions);
    }

    var body = document.getElementById('article-body');
    if (body && body.parentNode) {
      var notes = document.createElement('div');
      notes.className = 'lesson-notes';
      notes.innerHTML =
        '<div class="ln-head"><h3><i class="fa-solid fa-note-sticky"></i> My notes</h3>' +
        '<span class="ln-status">Saved in this browser</span></div>' +
        '<textarea id="ln-text" placeholder="Write your own notes for this section\u2026 they stay on this device."></textarea>';
      body.parentNode.insertBefore(notes, body.nextSibling);
      var ta = notes.querySelector('#ln-text');
      var status = notes.querySelector('.ln-status');
      ta.value = getNote(course, idx);
      var t = null;
      ta.addEventListener('input', function () {
        clearTimeout(t);
        status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving\u2026';
        t = setTimeout(function () {
          saveNote(course, idx, ta.value);
          status.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
        }, 400);
      });
    }
  }

  function scrollToHash() {
    if (!window.location.hash) return;
    var el = document.getElementById(window.location.hash.slice(1));
    if (el) setTimeout(function () { el.scrollIntoView(); }, 60);
  }

  /* ====================================================== GLOBAL SEARCH */

  function initGlobalSearch() {
    var nav = $('.header-nav');
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'icon-btn search-open';
    trigger.setAttribute('aria-label', 'Search all lessons');
    trigger.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
    if (nav) nav.insertBefore(trigger, nav.firstChild);
    else { var h = $('.site-header'); if (h) h.appendChild(trigger); }

    var modal = document.createElement('div');
    modal.className = 'search-modal';
    modal.id = 'search-modal';
    modal.innerHTML =
      '<div class="sm-backdrop"></div>' +
      '<div class="sm-panel" role="dialog" aria-modal="true" aria-label="Search lessons">' +
      '<div class="sm-bar"><span><i class="fa-solid fa-magnifying-glass"></i></span>' +
      '<input id="sm-input" type="search" placeholder="Search every lesson\u2026 try &quot;JWT&quot;, &quot;@Transactional&quot;, &quot;N+1&quot;" autocomplete="off">' +
      '<kbd>Esc</kbd></div>' +
      '<div class="sm-meta" id="sm-meta"></div>' +
      '<div class="sm-results" id="sm-results"><div class="sm-hint">Type at least 2 characters. Press <kbd>/</kbd> anywhere to open search.</div></div>' +
      '</div>';
    document.body.appendChild(modal);

    var input = modal.querySelector('#sm-input');
    var results = modal.querySelector('#sm-results');
    var meta = modal.querySelector('#sm-meta');

    function open() {
      modal.classList.add('open');
      document.body.classList.add('no-scroll');
      setTimeout(function () { input.focus(); }, 20);
    }
    function close() {
      modal.classList.remove('open');
      document.body.classList.remove('no-scroll');
    }
    function run() {
      var q = input.value.trim();
      if (q.length < 2) {
        results.innerHTML = '<div class="sm-hint">Type at least 2 characters.</div>';
        meta.textContent = '';
        return;
      }
      var hits = searchAll(q);
      meta.textContent = hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for \u201C' + q + '\u201D';
      results.innerHTML = hits.length ? hits.slice(0, 60).map(function (h) {
        return '<a class="result" href="lesson.html?c=' + encodeURIComponent(h.course.id) + '&s=' + h.idx + '">' +
          '<div class="r-top"><span class="r-course">' + esc(h.course.title) + '</span>' +
          '<span class="r-title">' + highlightTerm(esc(cleanTitle(h.section.title)), q) + '</span></div>' +
          '<div class="r-snippet">' + snippetAround(h.text, q) + '</div></a>';
      }).join('') : '<div class="sm-hint">No matches. Try another term.</div>';
    }

    trigger.addEventListener('click', open);
    modal.querySelector('.sm-backdrop').addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.result')) close();
    });
    var timer = null;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 150); });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'k')) {
        e.preventDefault();
        if (modal.classList.contains('open')) close(); else open();
      } else if (e.key === 'Escape' && modal.classList.contains('open')) {
        close();
      }
    });
  }

  /* ============================================================ BOOT */

  function boot() {
    loadCourses();
    initTheme();
    bindCopy(document);
    initGlobalSearch();
    if (PAGE === 'index') initIndex();
    else if (PAGE === 'course') initCourse();
    else if (PAGE === 'lesson') { initDrawer(); initLesson(); initNavFilter(); }
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
    window.addEventListener('beforeprint', function () {
      $$('details').forEach(function (d) { if (!d.classList.contains('toc')) d.open = true; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  if (typeof window !== 'undefined') window.__JP = { renderMarkdown: renderMarkdown, highlight: highlight };
})();
