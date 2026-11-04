import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {localTarget, renderMarkdown, scrollToFragment} from '../web/markdown.mjs';

const documentFor = source => new JSDOM(renderMarkdown(source, 'docs/read me.md')).window.document;
test('renders basic Markdown without executing HTML or unsafe URLs', () => {
  const document = documentFor('# Title\n\n**Bold** and `code`\n\n- One\n- Two\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![x](javascript:alert(1))');
  assert.equal(document.querySelector('h1').textContent, 'Title');
  assert.equal(document.querySelector('strong').textContent, 'Bold');
  assert.equal(document.querySelectorAll('li').length, 2);
  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('[href^="javascript:"], [src^="javascript:"]'), null);
  assert.match(document.body.textContent, /<script>/);
});
test('resolves encoded relative images and document links within the gallery', () => {
  const document = documentFor('![photo](../images/a%20b.png)\n\n[next](./next.md#hello)\n\n[web](https://example.com)');
  assert.equal(document.querySelector('img').getAttribute('src'), '/media?path=images%2Fa+b.png');
  const link = document.querySelector('a');
  assert.equal(link.dataset.documentPath, 'docs/next.md');
  assert.equal(link.dataset.documentFragment, 'hello');
  assert.equal(document.querySelectorAll('a')[1].getAttribute('rel'), 'noopener noreferrer');
  assert.equal(localTarget('../../secret.md', 'docs/read.md'), null);
  assert.equal(localTarget('%2e%2e/%2e%2e/secret.md', 'docs/read.md'), null);
  assert.equal(localTarget('a%5cb.md', 'docs/read.md'), null);
  assert.equal(localTarget('a%00.md', 'docs/read.md'), null);
  assert.equal(localTarget('%broken', 'docs/read.md'), null);
  assert.deepEqual(localTarget('/root.md', 'docs/read.md'), {path:'root.md', fragment:''});
});
test('creates unique heading targets and keeps same-document anchors in the reader', () => {
  const document = documentFor('# Hello\n\n# Hello\n\n# 中文\n\n[go](#hello-1)');
  assert.deepEqual([...document.querySelectorAll('h1')].map(n=>n.id), ['hello','hello-1','中文']);
  assert.equal(document.querySelector('a').dataset.documentPath, 'docs/read me.md');
  let scrolled = false;
  document.getElementById('中文').scrollIntoView = () => { scrolled = true; };
  scrollToFragment(document.body, encodeURIComponent('中文'));
  assert.equal(scrolled, true);
});
