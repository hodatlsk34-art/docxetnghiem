import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
const { h } = await import('../../js/dom.js');

const PAYLOADS = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', "'><script>alert(1)</script>", 'javascript:alert(1)'];

test('h() luôn hiển thị chuỗi như văn bản', () => {
  for (const p of PAYLOADS) {
    const el = h('div', { class: 'x', text: p });
    const el2 = h('p', {}, p, h('span', {}, p));
    assert.equal(el.querySelector('img,svg,script'), null);
    assert.equal(el2.querySelector('img,svg,script'), null);
    assert.equal(el.textContent, p);
  }
});
test('h() chặn thuộc tính nguy hiểm', () => {
  assert.throws(() => h('div', { innerHTML: '<b>x</b>' }));
  assert.throws(() => h('div', { onerror: 'alert(1)' }));
  assert.throws(() => h('div', { style: 'color:red' }));
});
test('không có innerHTML/insertAdjacentHTML với dữ liệu ở mã nguồn', () => {
  for (const f of fs.readdirSync(new URL('../../js/', import.meta.url))) {
    const src = fs.readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
    const uses = [...src.matchAll(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/g)];
    if (f === 'dom.js') {
      // chỉ một chỗ: gán SVG hằng số cho biểu tượng
      assert.equal(uses.length, 1, f);
      assert.match(src, /s\.innerHTML = P\[name\] \|\| P\.info;/);
    } else assert.equal(uses.length, 0, f);
  }
});
