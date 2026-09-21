document.addEventListener('DOMContentLoaded', () => {
    // DOM refs
    const htmlEl          = document.documentElement;
    const bodyEl          = document.body;
    const themeToggle     = document.getElementById('theme-toggle');
    const themeIcon       = document.getElementById('theme-icon');
    const themeLabel      = document.getElementById('theme-label');
    const fontIncrease    = document.getElementById('font-increase');
    const fontDecrease    = document.getElementById('font-decrease');
    const dyslexicToggle  = document.getElementById('dyslexic-toggle');
    const chatForm        = document.getElementById('chat-form');
    const userQuery       = document.getElementById('user-query');
    const chatMessages    = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const btnSubmit       = document.getElementById('btn-submit');
    const btnReingest     = document.getElementById('btn-reingest');
    const toastContainer  = document.getElementById('toast-container');

    let currentFontSize = 16;

    // -------------------------------------------------------------------------
    // THEME
    // -------------------------------------------------------------------------
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    themeToggle.addEventListener('click', () => {
        const next = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        applyTheme(next);
        showToast(`Thème ${next === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    });

    function applyTheme(theme) {
        htmlEl.setAttribute('data-theme', theme);
        if (themeIcon)  themeIcon.className  = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        if (themeLabel) themeLabel.textContent = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
        if (themeToggle) {
            themeToggle.title        = theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre';
            themeToggle.setAttribute('aria-label', themeToggle.title);
        }
    }

    // -------------------------------------------------------------------------
    // FONT SIZE
    // -------------------------------------------------------------------------
    fontIncrease.addEventListener('click', () => {
        if (currentFontSize < 24) {
            currentFontSize += 2;
            htmlEl.style.setProperty('--base-font-size', `${currentFontSize}px`);
            showToast(`Taille du texte : ${currentFontSize}px`, 'info');
        }
    });

    fontDecrease.addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            htmlEl.style.setProperty('--base-font-size', `${currentFontSize}px`);
            showToast(`Taille du texte : ${currentFontSize}px`, 'info');
        }
    });

    // -------------------------------------------------------------------------
    // DYSLEXIC FONT
    // -------------------------------------------------------------------------
    dyslexicToggle.addEventListener('click', () => {
        bodyEl.classList.toggle('dyslexic-mode');
        const active = bodyEl.classList.contains('dyslexic-mode');
        localStorage.setItem('dyslexic-font', active ? 'true' : 'false');
        showToast(active ? 'Police dyslexique activée' : 'Police dyslexique désactivée', 'info');
    });

    if (localStorage.getItem('dyslexic-font') === 'true') {
        bodyEl.classList.add('dyslexic-mode');
    }

    // -------------------------------------------------------------------------
    // TEXTAREA — auto-resize
    // -------------------------------------------------------------------------
    userQuery.addEventListener('input', () => {
        userQuery.style.height = 'auto';
        userQuery.style.height = Math.min(userQuery.scrollHeight, 160) + 'px';
    });

    // Keyboard submit
    userQuery.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            userQuery.value = chip.textContent.trim();
            userQuery.style.height = 'auto';
            userQuery.style.height = Math.min(userQuery.scrollHeight, 160) + 'px';
            chatForm.dispatchEvent(new Event('submit'));
        });
    });

    // -------------------------------------------------------------------------
    // CHAT SUBMIT & STREAMING
    // -------------------------------------------------------------------------
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = userQuery.value.trim();
        if (!question) return;

        appendMessage(question, 'user');
        userQuery.value = '';
        userQuery.style.height = 'auto';
        setLoadingState(true);

        try {
            const response = await fetch('/api/query_stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, n_results: 4 })
            });

            if (!response.ok) throw new Error("Impossible d'obtenir une réponse.");

            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            let answerText  = '';
            let sourcesData = [];

            // Temporary streaming bubble
            const streamDiv    = createMessageShell('system');
            const streamBody   = streamDiv.querySelector('.message-content');
            chatMessages.appendChild(streamDiv);

            let buffer = '';
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const data = JSON.parse(line);
                            if (data.type === 'sources') {
                                sourcesData = data.data;
                            } else if (data.type === 'chunk') {
                                answerText += data.data;
                                streamBody.innerHTML = parseMarkdown(answerText);
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            } else if (data.type === 'done') {
                                streamDiv.remove();
                                appendMessage(answerText, 'system', sourcesData);
                            }
                        } catch (err) {
                            console.warn('JSON parse error:', err, line);
                        }
                    }
                }
            }

            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.type === 'chunk') {
                        answerText += data.data;
                    } else if (data.type === 'done') {
                        streamDiv.remove();
                        appendMessage(answerText, 'system', sourcesData);
                    }
                } catch (err) {}
            }

        } catch (err) {
            appendMessage(`Une erreur est survenue : ${err.message}`, 'system');
            showToast(err.message, 'error');
        } finally {
            setLoadingState(false);
        }
    });

    // -------------------------------------------------------------------------
    // RE-INGEST
    // -------------------------------------------------------------------------
    btnReingest.addEventListener('click', async () => {
        btnReingest.disabled = true;
        showToast("Ré-indexation du RGAA 4.1 en cours…", 'info');
        try {
            const res  = await fetch('/api/ingest', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                showToast('Ré-indexation lancée en tâche de fond', 'success');
            } else {
                throw new Error(data.message || 'Erreur.');
            }
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setTimeout(() => { btnReingest.disabled = false; }, 3000);
        }
    });

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------
    function setLoadingState(isLoading) {
        typingIndicator.style.display = isLoading ? 'flex' : 'none';
        btnSubmit.disabled  = isLoading;
        userQuery.disabled  = isLoading;
        if (!isLoading) userQuery.focus();
        if (isLoading) chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function createMessageShell(sender) {
        const wrap   = document.createElement('div');
        wrap.className = `message ${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.setAttribute('aria-hidden', 'true');

        if (sender === 'system') {
            avatar.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect width="7" height="7" rx="1.5" fill="currentColor" opacity=".9"/>
                <rect x="9" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/>
                <rect y="9" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/>
                <rect x="9" y="9" width="7" height="7" rx="1.5" fill="currentColor" opacity=".35"/>
            </svg>`;
        } else {
            avatar.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
        }

        const body   = document.createElement('div');
        body.className = 'message-body';

        const sender_label = document.createElement('p');
        sender_label.className = 'message-sender';
        sender_label.textContent = sender === 'system' ? 'RGAA DevCompanion' : 'Vous';

        const content = document.createElement('div');
        content.className = 'message-content';

        body.appendChild(sender_label);
        body.appendChild(content);
        wrap.appendChild(avatar);
        wrap.appendChild(body);
        return wrap;
    }

    function appendMessage(text, sender, sources = null) {
        const wrap    = createMessageShell(sender);
        const content = wrap.querySelector('.message-content');

        if (sender === 'system') {
            content.innerHTML = parseMarkdown(text);

            if (sources && sources.length > 0) {
                const section = document.createElement('div');
                section.className = 'message-sources-section';

                const heading = document.createElement('div');
                heading.className = 'sources-heading';
                heading.innerHTML = '<i class="fa-solid fa-bookmark" aria-hidden="true"></i> Sources RGAA associées';
                section.appendChild(heading);

                const accordions = document.createElement('div');
                accordions.className = 'sources-accordions';

                sources.forEach((src) => {
                    const details = document.createElement('details');
                    details.className = 'source-details';
                    details.id = `details-${src.id}`;

                    const meta = src.metadata;
                    let title    = '';
                    let badgeText = meta.type === 'critere' ? `Critère ${meta.critere}` : 'Glossaire';
                    let wcag     = '';

                    if (meta.type === 'critere') {
                        title = meta.theme || '';
                        wcag  = meta.wcag ? `WCAG ${meta.wcag}` : '';
                    } else if (meta.type === 'glossaire') {
                        title = meta.terme || '';
                    }

                    const summary = document.createElement('summary');
                    summary.innerHTML = `
                        <span class="source-badge">${badgeText}</span>
                        <span>${escapeHTML(title)}</span>
                        ${wcag ? `<span class="source-wcag">${escapeHTML(wcag)}</span>` : ''}
                    `;

                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'details-content';
                    contentDiv.textContent = src.text_snippet;

                    details.appendChild(summary);
                    details.appendChild(contentDiv);
                    accordions.appendChild(details);
                });

                section.appendChild(accordions);
                content.appendChild(section);
            }

            // Critère badges → click → open accordion
            content.querySelectorAll('.critere-badge').forEach(badge => {
                badge.addEventListener('click', () => {
                    const targetId = badge.getAttribute('data-target')?.replace('critere-', 'details-critere-');
                    if (!targetId) return;
                    const el = content.querySelector(`#${targetId}`);
                    if (el) {
                        el.open = true;
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('highlight-pulse');
                        setTimeout(() => el.classList.remove('highlight-pulse'), 1500);
                    }
                });
            });
        } else {
            content.textContent = text;
        }

        chatMessages.appendChild(wrap);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function parseMarkdown(md) {
        if (!md) return '';
        let html = '';

        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
            html = marked.parse(md);
        } else {
            // Minimal fallback
            const blocks = [];
            html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
                const ph = `__CB_${blocks.length}__`;
                blocks.push(`<pre><code class="language-${lang}">${escapeHTML(code.trim())}</code></pre>`);
                return ph;
            });
            html = escapeHTML(html);
            blocks.forEach((b, i) => { html = html.replace(`__CB_${i}__`, b); });
            html = html
                .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
                .replace(/^## (.*?)$/gm,  '<h2>$1</h2>')
                .replace(/^# (.*?)$/gm,   '<h1>$1</h1>')
                .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([\s\S]*?)\*/g,     '<em>$1</em>')
                .replace(/`([^`]+)`/g,          '<code>$1</code>')
                .replace(/\n/g, '<br>');
        }

        // RGAA criteria → interactive badges
        html = html.replace(/(Critère|critère)\s+(\d+\.\d+)/g, (_, word, num) => {
            return `<span class="critere-badge" data-target="critere-${num}" role="button" tabindex="0" title="Voir la source du critère ${num}">${word} ${num}</span>`;
        });

        return html;
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
        toast.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}" aria-hidden="true"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.25s ease forwards';
            setTimeout(() => toast.remove(), 250);
        }, 3000);
    }
});
