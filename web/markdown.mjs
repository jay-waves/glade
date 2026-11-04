import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

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

function rewriteUrl(token, attribute, env) {
  const href = token.attrGet(attribute) ?? '';
  if (/^(?:https?:|mailto:)/i.test(href) || href.startsWith('//')) return;
  const target = localTarget(href, env.path);
  if (!target) { token.attrSet(attribute, ''); return; }
  token.attrSet(attribute, `/media?${new URLSearchParams({ path: target.path })}${target.fragment ? '#' + target.fragment : ''}`);
  if (attribute === 'href' && /\.md$/i.test(target.path)) {
    token.attrSet('data-document-path', target.path);
    token.attrSet('data-document-fragment', target.fragment);
  }
}
const image = md.renderer.rules.image;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  rewriteUrl(tokens[index], 'src', env);
  tokens[index].attrSet('loading', 'lazy');
  return image(tokens, index, options, env, self);
};
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  rewriteUrl(tokens[index], 'href', env);
  if (!tokens[index].attrGet('data-document-path')) {
    tokens[index].attrSet('target', '_blank');
    tokens[index].attrSet('rel', 'noopener noreferrer');
  }
  return self.renderToken(tokens, index, options);
};

export function renderMarkdown(source, path) {
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
  return md.renderer.render(tokens, md.options, { path });
}

export function scrollToFragment(article, fragment) {
  if (!fragment) return;
  try {
    const id = decodeURIComponent(fragment);
    [...article.querySelectorAll('[id]')].find(node => node.id === id)?.scrollIntoView({ block: 'start' });
  } catch { /* A malformed fragment does not prevent opening the document. */ }
}
