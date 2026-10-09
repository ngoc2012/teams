// Floating button: scrolls chat to top, collecting messages (list is virtualized), then downloads.
const msgs = new Map(); // data-mid -> message
let lastAuthor = '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function collect() {
  document.querySelectorAll('#chat-pane-list [data-tid="chat-pane-item"]').forEach(item => {
    const body = item.querySelector('[data-tid="chat-pane-message"]');
    if (!body) return; // date divider etc.
    const mid = body.dataset.mid;
    const author = item.querySelector('[data-tid="message-author-name"]')?.textContent.trim();
    if (msgs.has(mid)) return;
    const content = body.querySelector('[data-message-content]');
    // quoted reply: keep quote separate, strip from main text
    const quote = content?.querySelector('[data-tid="quoted-reply-card"]');
    const quoteText = quote?.innerText.trim().replace(/\n+/g, ' ') || '';
    const clone = content?.cloneNode(true);
    clone?.querySelector('[data-tid="quoted-reply-card"]')?.remove();
    clone?.querySelectorAll('img[itemtype*="Emoji"]').forEach(i => i.replaceWith(i.alt));
    msgs.set(mid, {
      id: mid,
      author: author || '',
      time: body.parentElement.querySelector('time')?.dateTime || new Date(+mid).toISOString(),
      text: (clone?.innerText || '').trim(),
      quote: quoteText,
      attachments: [...body.querySelectorAll('[data-tid="file-attachment-grid"] img')].map(i => i.alt || i.title),
      reactions: [...body.querySelectorAll('[data-tid="diverse-reaction-pill-button"]')].map(b => b.querySelector('img')?.alt + ' ' + (b.textContent.match(/^\d+/)?.[0] || '')).map(s => s.trim()),
    });
  });
}

function scroller() {
  let el = document.querySelector('#chat-pane-list');
  while (el && el !== document.body) {
    const o = getComputedStyle(el).overflowY;
    if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
}

async function run(btn) {
  const sc = scroller();
  if (!sc) return alert('Open a conversation first (scroll container not found).');
  msgs.clear();
  const now = new Date();
  const cutoff = { all: 0, month: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), year: new Date(now.getFullYear(), 0, 1).getTime() }[sel.value];
  let stable = 0;
  while (stable < 8) {
    if (cutoff && Math.min(...msgs.keys()) < cutoff) break; // oldest collected is before range // 8 rounds w/o progress at top = reached start
    const before = msgs.size, h = sc.scrollHeight;
    collect();
    sc.scrollTop = 200; // nudge so the top-load trigger re-fires when already at 0
    await sleep(300);
    sc.scrollTop = 0;
    // poll up to 6s for older messages to load (scrollHeight grows)
    for (let i = 0; i < 12 && sc.scrollHeight === h; i++) await sleep(500);
    await sleep(500);
    collect();
    btn.textContent = `Scraping… ${msgs.size}`;
    stable = msgs.size === before && sc.scrollHeight === h ? stable + 1 : 0;
  }
  const all = [...msgs.values()].filter(m => m.id >= cutoff).sort((a, b) => a.id - b.id);
  const txt = all.map(m =>
    `[${m.time}] ${m.author}: ${m.quote ? `(re: ${m.quote}) ` : ''}${m.text}` +
    (m.attachments.length ? ` [attachments: ${m.attachments.join(', ')}]` : '') +
    (m.reactions.length ? ` [reactions: ${m.reactions.join(' ')}]` : '')
  ).join('\n');
  const p = n => String(n).padStart(2, '0');
  const stamp = { year: `${now.getFullYear()}`, month: `${now.getFullYear()}-${p(now.getMonth() + 1)}`, all: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` }[sel.value];
  for (const [name, data, type] of [
    ['json', JSON.stringify(all, null, 2), 'application/json'],
    ['txt', txt, 'text/plain'],
  ]) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = `teams-chat-${stamp}.${name}`;
    a.click();
  }
  btn.textContent = `Done: ${all.length} msgs`;
}

const wrap = document.createElement('div');
Object.assign(wrap.style, { position: 'fixed', bottom: '80px', right: '20px', zIndex: 99999, display: 'flex', gap: '6px' });
const sel = document.createElement('select');
sel.innerHTML = '<option value="all">All</option><option value="month">Current month</option><option value="year">Current year</option>';
sel.style.cssText = 'padding:6px;border-radius:6px;font:14px sans-serif';
const btn = document.createElement('button');
btn.textContent = 'Scrape chat';
btn.style.cssText = 'padding:8px 14px;background:#5b5fc7;color:#fff;border:0;border-radius:6px;cursor:pointer;font:14px sans-serif';
btn.onclick = () => { btn.disabled = sel.disabled = true; run(btn).finally(() => (btn.disabled = sel.disabled = false)); };
wrap.append(sel, btn);
document.body.append(wrap);
