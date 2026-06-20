window.PlansUI = {
  _stylesInjected: false,

  injectStyles() {
    if (this._stylesInjected) return;
    this._stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      .item-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border-bottom: 1px solid #f0ece4;
      }
      .item-row:last-child { border-bottom: none; }
      .item-row .item {
        flex: 1;
        min-width: 0;
        border-bottom: none;
        padding: 10px 0;
      }
      .item-row.done .text {
        color: #9a9080;
        text-decoration: line-through;
        text-decoration-color: #c8c0b4;
      }
      .item-copy {
        flex-shrink: 0;
        margin-top: 9px;
        font-family: "Geist Mono", monospace;
        font-size: 9px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 6px 11px;
        border-radius: 6px;
        border: 1px solid #e8e2d8;
        background: #faf8f5;
        color: #7a7268;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, color 0.15s;
        white-space: nowrap;
      }
      .item-copy:hover {
        border-color: #b8943a;
        color: #18150e;
        background: rgba(184,148,58,0.1);
      }
      .item-copy:disabled { opacity: 0.55; cursor: wait; }
    `;
    document.head.appendChild(s);
  },

  async copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  },

  flash(btn, label, ms = 1400) {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = orig;
      btn.disabled = false;
    }, ms);
  },

  buildAIPrompt({ task, phase, planTitle, planKind }) {
    const hints = {
      code: 'Implement this in the Scholar app (StudentHQ-V2, index.html React SPA). Match existing code style. Only change what this task requires.',
      design: 'Improve the visual design and UX of Scholar (StudentHQ-V2). CSS, layout, typography, and UI polish only — no unrelated refactors.',
      launch: 'Help me complete this launch/deployment step for Scholar (StudentHQ-V2). Be specific and actionable.',
      testing: 'Tell me exactly how to manually test this in Scholar (StudentHQ-V2) and what pass/fail looks like.',
    };
    return [
      `Scholar — ${planTitle}`,
      '',
      `Phase: ${phase}`,
      `Task: ${task}`,
      '',
      hints[planKind] || hints.code,
    ].join('\n');
  },

  renderPlan({ plan, state, itemId, escapeHtml, planTitle, planKind, onCheck }) {
    this.injectStyles();
    const root = document.getElementById('plan');
    if (!root) return;

    root.innerHTML = plan.map((phase, pi) => {
      const rows = phase.items.map((text, ii) => {
        const id = itemId(pi, ii);
        const checked = !!state[id];
        return `
          <div class="item-row${checked ? ' done' : ''}" data-id="${id}">
            <label class="item">
              <input type="checkbox" ${checked ? 'checked' : ''} data-id="${id}" />
              <span class="text">${escapeHtml(text)}</span>
            </label>
            <button type="button" class="item-copy" data-pi="${pi}" data-ii="${ii}" title="Copy as AI prompt">Prompt</button>
          </div>`;
      }).join('');
      return `
        <section class="${phase.sprint ? 'sprint' : ''}">
          <h2>${escapeHtml(phase.title)}</h2>
          ${phase.note ? `<p class="phase-note">${escapeHtml(phase.note)}</p>` : ''}
          ${phase.doneWhen ? `<p class="done-when">${escapeHtml(phase.doneWhen)}</p>` : ''}
          ${rows}
        </section>`;
    }).join('');

    root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        onCheck(cb.dataset.id, cb.checked);
        const row = cb.closest('.item-row');
        if (row) row.classList.toggle('done', cb.checked);
      });
    });

    root.querySelectorAll('.item-copy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pi = +btn.dataset.pi;
        const ii = +btn.dataset.ii;
        const prompt = this.buildAIPrompt({
          task: plan[pi].items[ii],
          phase: plan[pi].title,
          planTitle,
          planKind,
        });
        try {
          await this.copyText(prompt);
          this.flash(btn, 'Copied!');
        } catch {
          this.flash(btn, 'Failed');
        }
      });
    });
  },
};
