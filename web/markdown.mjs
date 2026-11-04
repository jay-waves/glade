import MarkdownIt from 'markdown-it';
import createDOMPurify from 'dompurify';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

// Resolve filesystem-relative URLs without letting .. escape the gallery root.
export function localTarget(href, documentPath) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null;
  const hashAt = href.indexOf('#');
  const fragment = hashAt < 0 ? '' : href.slice(hashAt + 1);
  const pathname = (hashAt < 0 ? href : href.slice(0, hashAt)).split('?')[0];
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (/[\\\0:]/.test(decoded)) return null;
  const parts = decoded.startsWith('/') ? [] : documentPath.split('/').slice(0, -1);
  if (!decoded) return { path: documentPath, fragment };
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return { path: parts.join('/'), fragment };
}

// Process both Markdown-generated elements and embedded HTML through one path.
function rewriteUrl(node, attribute, path) {
  const href = node.getAttribute(attribute)?.trim();
  if (href === undefined || href === null) return;
  if (/^https?:/i.test(href) || href.startsWith('//') || (attribute === 'href' && /^mailto:/i.test(href))) return;
  const target = localTarget(href, path);
  if (!target || !href) { node.removeAttribute(attribute); return; }
  node.setAttribute(attribute, `/media?${new URLSearchParams({ path: target.path })}${target.fragment ? '#' + target.fragment : ''}`);
  if (attribute === 'href' && /\.md$/i.test(target.path)) {
    node.setAttribute('data-document-path', target.path);
    node.setAttribute('data-document-fragment', target.fragment);
  }
}

export function renderMarkdown(source, path, window = globalThis.window) {
  const tokens = md.parse(source, { path });
  const used = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const text = (tokens[i + 1]?.children ?? []).map(token => token.content).join('');
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '').replace(/\s/g, '-') || 'section';
    let id = base, suffix = 0;
    while (used.has(id)) id = `${base}-${++suffix}`;
    used.add(id); tokens[i].attrSet('id', id);
  }
  const purifier = createDOMPurify(window);
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.nodeType !== 1) return;
    // Keep table alignment (including markdown-it's output), not arbitrary CSS.
    const alignment = node.style?.textAlign;
    node.removeAttribute('style');
    if (['left', 'center', 'right', 'justify'].includes(alignment)) node.style.textAlign = alignment;
    const align = node.getAttribute('align');
    if (align && !['left', 'center', 'right', 'justify'].includes(align)) node.removeAttribute('align');
    if (node.tagName === 'IMG') {
      rewriteUrl(node, 'src', path);
      node.setAttribute('loading', 'lazy');
      // Explicit HTML dimensions override the reader's responsive height:auto.
      for (const dimension of ['width', 'height']) {
        const value = node.getAttribute(dimension);
        if (value && /^\d+(?:\.\d+)?$/.test(value)) node.style[dimension] = `${value}px`;
      }
    }
    if (node.tagName === 'A') {
      rewriteUrl(node, 'href', path);
      if (node.hasAttribute('href') && !node.hasAttribute('data-document-path')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  return purifier.sanitize(md.renderer.render(tokens, md.options, { path }), {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 's', 'del',
      'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr',
      'th', 'td', 'caption', 'colgroup', 'col', 'div', 'span', 'sub', 'sup', 'details', 'summary', 'kbd', 'mark',
      'figure', 'figcaption', 'dl', 'dt', 'dd', 'abbr', 'small', 'samp'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'colspan',
      'rowspan', 'scope', 'span', 'align', 'valign', 'start', 'reversed', 'id', 'style', 'open'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    RETURN_DOM_FRAGMENT: true,
  });
}

export function scrollToFragment(article, fragment) {
  if (!fragment) return;
  try {
    const id = decodeURIComponent(fragment);
    [...article.querySelectorAll('[id]')].find(node => node.id === `user-content-${id}`)?.scrollIntoView({ block: 'start' });
  } catch { /* A malformed fragment does not prevent opening the document. */ }
}
