import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {localTarget, renderMarkdown, scrollToFragment} from '../web/markdown.mjs';

const documentFor = source => {
  const {window} = new JSDOM('');
  window.document.body.append(renderMarkdown(source, 'docs/read me.md', window));
  return window.document;
};
test('renders basic Markdown while removing executable HTML and unsafe URLs', () => {
  const document = documentFor('# Title\n\n**Bold** and `code`\n\n- One\n- Two\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![x](javascript:alert(1))');
  assert.equal(document.querySelector('h1').textContent, 'Title');
  assert.equal(document.querySelector('strong').textContent, 'Bold');
  assert.equal(document.querySelectorAll('li').length, 2);
  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('[href^="javascript:"], [src^="javascript:"]'), null);
  assert.doesNotMatch(document.body.textContent, /<script>/);
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
  assert.deepEqual([...document.querySelectorAll('h1')].map(n=>n.id), ['user-content-hello','user-content-hello-1','user-content-中文']);
  assert.equal(document.querySelector('a').dataset.documentPath, 'docs/read me.md');
  let scrolled = false;
  document.getElementById('user-content-中文').scrollIntoView = () => { scrolled = true; };
  scrollToFragment(document.body, encodeURIComponent('中文'));
  assert.equal(scrolled, true);
});

test('embedded images and tables retain dimensions, spans, captions and alignment', () => {
  const document = documentFor(`<p align="center"><img src="../images/a%20b.png" alt="A photo" width="240" height="120"></p>

<table>
<caption>Results</caption>
<thead><tr><th colspan="2" scope="colgroup">Group</th></tr></thead>
<tbody><tr><td rowspan="2" style="text-align: right">10</td><td><strong>Yes</strong></td></tr>
<tr><td><a href="next.md#hello">Read more</a></td></tr></tbody>
</table>`);
  const image = document.querySelector('img');
  assert.equal(image.getAttribute('src'), '/media?path=images%2Fa+b.png');
  assert.equal(image.getAttribute('width'), '240');
  assert.equal(image.getAttribute('height'), '120');
  assert.equal(image.alt, 'A photo');
  assert.equal(image.style.width, '240px');
  assert.equal(image.style.height, '120px');
  assert.equal(document.querySelector('p').getAttribute('align'), 'center');
  assert.equal(document.querySelector('caption').textContent, 'Results');
  assert.equal(document.querySelector('th').colSpan, 2);
  assert.equal(document.querySelector('td').rowSpan, 2);
  assert.equal(document.querySelector('td').style.textAlign, 'right');
  assert.equal(document.querySelector('a').dataset.documentPath, 'docs/next.md');
});

test('HTML cannot inject scripts, UI identifiers, event handlers, CSS or navigation metadata', () => {
  const document = documentFor(`<div id="viewer" style="position:fixed;inset:0;background:url(https://example.com/track)">
<script>alert(1)</script><iframe src="https://example.com"></iframe><style>body{display:none}</style>
<img src="../photo.png" onerror="alert(1)" srcset="https://example.com/a 2x">
<a href="java&#x73;cript:alert(1)" onclick="alert(1)" data-document-path="../../secret.md">bad</a>
<a href="next.md" data-document-path="../../secret.md">next</a>
<img src="../../secret.png"><img src="data:image/svg+xml,xxx">
<form><input name="viewer"></form><svg onload="alert(1)"></svg>
</div>`);
  assert.equal(document.querySelector('script,iframe,style,form,input,svg'), null);
  assert.equal(document.querySelector('[onerror],[onclick],[srcset],[style],[id="viewer"]'), null);
  assert.equal(document.querySelector('div').id, 'user-content-viewer');
  const links = document.querySelectorAll('a');
  assert.equal(links[0].hasAttribute('href'), false);
  assert.equal(links[0].hasAttribute('data-document-path'), false);
  assert.equal(links[1].dataset.documentPath, 'docs/next.md');
  assert.equal(document.querySelectorAll('img')[1].hasAttribute('src'), false);
  assert.equal(document.querySelectorAll('img')[2].hasAttribute('src'), false);
});

test('Markdown tables retain alignment and fenced HTML remains literal code', () => {
  const document = documentFor('| Left | Right |\n| :--- | ---: |\n| A | B |\n\n```html\n<img src="x.png">\n```');
  assert.equal(document.querySelectorAll('th')[1].style.textAlign, 'right');
  assert.match(document.querySelector('code').textContent, /<img src="x.png">/);
  assert.equal(document.querySelector('img'), null);
});

test('common HTML preserves native disclosures and document semantics without executable attributes', () => {
  const document = documentFor(`<details open ontoggle="alert(1)"><summary>More <kbd>Ctrl</kbd></summary>
<p><mark>Important</mark> <abbr title="Hypertext Markup Language">HTML</abbr> <small>Note</small> <samp>OK</samp></p>
<figure><img src="../photo.png" width="320"><figcaption>Photo caption</figcaption></figure>
<dl><dt>Term</dt><dd>Definition</dd></dl>
</details>
<details><summary>Closed</summary><p>Hidden until expanded</p></details>`);
  const details = document.querySelectorAll('details');
  assert.equal(details.length, 2);
  assert.equal(details[0].open, true);
  assert.equal(details[1].open, false);
  assert.equal(details[0].hasAttribute('ontoggle'), false);
  assert.equal(document.querySelector('summary kbd').textContent, 'Ctrl');
  assert.equal(document.querySelector('mark').textContent, 'Important');
  assert.equal(document.querySelector('abbr').title, 'Hypertext Markup Language');
  assert.equal(document.querySelector('figure img').getAttribute('src'), '/media?path=photo.png');
  assert.equal(document.querySelector('figcaption').textContent, 'Photo caption');
  assert.equal(document.querySelector('dl dt').textContent, 'Term');
  assert.equal(document.querySelector('dl dd').textContent, 'Definition');
  assert.equal(document.querySelector('small').textContent, 'Note');
  assert.equal(document.querySelector('samp').textContent, 'OK');
});
