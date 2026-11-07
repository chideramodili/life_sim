// Adulthood: the job interview. The server picks the questions, keeps the right answers and decides the result;
// this file only shows the questions and sends back which answer was picked for each.
import { hideOtherPanels } from './panels.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function initInterview(socket) {
  const panel = $('interviewPanel'), body = $('interviewBody');
  $('interviewClose').addEventListener('click', () => { panel.hidden = true; });
  socket.on('interview', (iv) => {
    hideOtherPanels('interviewPanel');
    body.replaceChildren();
    body.append(el('div', 'fine', `The manager will interview you for: ${iv.title}. Pick the best answer to each question.`));
    const picked = iv.qs.map(() => -1);
    const submit = el('button', 'work', 'Submit answers');
    submit.disabled = true;
    iv.qs.forEach((q, qi) => {
      const box = el('div', 'job');
      box.append(el('div', 'billWho', `${qi + 1}. ${q.q}`));
      const btns = q.a.map((text, ai) => {
        const b = el('button', 'ivOpt', text);
        b.type = 'button';
        b.addEventListener('click', () => {
          picked[qi] = ai;
          btns.forEach((x, k) => x.classList.toggle('on', k === ai));
          submit.disabled = picked.some((n) => n < 0);
        });
        return b;
      });
      box.append(...btns);
      body.append(box);
    });
    submit.addEventListener('click', () => { submit.disabled = true; socket.emit('interviewAnswer', { answers: picked }); });
    body.append(submit);
    panel.hidden = false;
  });
  socket.on('interviewDone', () => { panel.hidden = true; });
}