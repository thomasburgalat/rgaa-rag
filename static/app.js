document.addEventListener('DOMContentLoaded', () => {
    // Dom elements
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const fontIncrease = document.getElementById('font-increase');
    const fontDecrease = document.getElementById('font-decrease');
    const dyslexicToggle = document.getElementById('dyslexic-toggle');
    
    const chatForm = document.getElementById('chat-form');
    const userQuery = document.getElementById('user-query');
    const chatMessages = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const btnSubmit = document.getElementById('btn-submit');
    const btnReingest = document.getElementById('btn-reingest');
    const sourcesContainer = document.getElementById('sources-container');
    const toastContainer = document.getElementById('toast-container');

    let currentFontSize = 16; // taille de police par defaut (px)

    // --- ACCESSIBILITE & OPTIONS ---

    // Gestion du theme (sombre par defaut)
    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlEl.setAttribute('data-theme', savedTheme);
    htmlEl.setAttribute('data-fr-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        htmlEl.setAttribute('data-fr-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        showToast(`Thème ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'info');
    });

    function updateThemeIcon(theme) {
        if (themeIcon) {
            if (theme === 'dark') {
                themeIcon.className = 'fa-solid fa-sun';
            } else {
                themeIcon.className = 'fa-solid fa-moon';
            }
        }
        
        // Ajustement des classes DSFR pour l'icone du bouton theme
        if (themeToggle) {
            if (theme === 'dark') {
                themeToggle.title = "Passer au thème clair";
                themeToggle.setAttribute('aria-label', "Passer au thème clair");
                themeToggle.classList.remove('fr-icon-theme-fill');
                themeToggle.classList.remove('fr-icon-sun-fill');
                themeToggle.classList.add('fr-icon-moon-fill');
            } else {
                themeToggle.title = "Passer au thème sombre";
                themeToggle.setAttribute('aria-label', "Passer au thème sombre");
                themeToggle.classList.remove('fr-icon-theme-fill');
                themeToggle.classList.remove('fr-icon-moon-fill');
                themeToggle.classList.add('fr-icon-sun-fill');
            }
        }
    }

    // Boutons de changement de taille de police
    fontIncrease.addEventListener('click', () => {
        if (currentFontSize < 24) {
            currentFontSize += 2;
            htmlEl.style.setProperty('--base-font-size', `${currentFontSize}px`);
            showToast(`Taille du texte augmentée (${currentFontSize}px)`, 'info');
        }
    });

    fontDecrease.addEventListener('click', () => {
        if (currentFontSize > 12) {
            currentFontSize -= 2;
            htmlEl.style.setProperty('--base-font-size', `${currentFontSize}px`);
            showToast(`Taille du texte diminuée (${currentFontSize}px)`, 'info');
        }
    });

    // Switch pour la police dyslexique
    dyslexicToggle.addEventListener('click', () => {
        bodyEl.classList.toggle('dyslexic-mode');
        const isActive = bodyEl.classList.contains('dyslexic-mode');
        dyslexicToggle.classList.toggle('active', isActive);
        localStorage.setItem('dyslexic-font', isActive ? 'true' : 'false');
        showToast(isActive ? "Police dyslexique activée" : "Police dyslexique désactivée", "info");
    });

    if (localStorage.getItem('dyslexic-font') === 'true') {
        bodyEl.classList.add('dyslexic-mode');
        dyslexicToggle.classList.add('active');
    }

    // Submit le formulaire si on appuie sur Entree (sauf si shift est enfonce)
    userQuery.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Chips de suggestions cliquables
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            userQuery.value = chip.textContent;
            chatForm.dispatchEvent(new Event('submit'));
        });
    });

    // --- LOGIQUE CHAT & STREAMING ---

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const question = userQuery.value.trim();
        if (!question) return;

        // Affiche le message de l'utilisateur dans le chat
        appendMessage(question, 'user');
        userQuery.value = '';
        
        // On desactive les inputs pendant la generation
        setLoadingState(true);

        try {
            const response = await fetch('/api/query_stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: question, n_results: 4 })
            });

            if (!response.ok) {
                throw new Error("Impossible d'obtenir une réponse de l'assistant.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            
            let answerText = "";
            let sourcesData = [];
            
            // On cree la bulle de message systeme vide pour le streaming
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message system-message';

            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

            const body = document.createElement('div');
            body.className = 'message-body';
            
            msgDiv.appendChild(avatar);
            msgDiv.appendChild(body);
            chatMessages.appendChild(msgDiv);

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    const chunkStr = decoder.decode(value, { stream: true });
                    const lines = chunkStr.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.type === 'sources') {
                                    sourcesData = data.data;
                                } else if (data.type === 'chunk') {
                                    answerText += data.data;
                                    body.innerHTML = parseMarkdown(answerText);
                                    chatMessages.scrollTop = chatMessages.scrollHeight;
                                } else if (data.type === 'done') {
                                    // C'est fini, on remplace le message temporaire par le message formate avec les sources
                                    msgDiv.remove();
                                    appendMessage(answerText, 'system', sourcesData);
                                }
                            } catch (err) {
                                console.error("Erreur de parsing JSON:", err, line);
                            }
                        }
                    }
                }
            }

        } catch (error) {
            appendMessage(`Une erreur est survenue : ${error.message}`, 'system');
            showToast(error.message, 'error');
        } finally {
            setLoadingState(false);
        }
    });

    // Ingestion manuelle
    btnReingest.addEventListener('click', async () => {
        btnReingest.disabled = true;
        showToast("Lancement de l'ingestion des critères...", "info");
        try {
            const response = await fetch('/api/ingest', { method: 'POST' });
            const data = await response.json();
            if (data.status === 'success') {
                showToast("Ingestion lancée en tâche de fond. Cela prendra quelques secondes.", "success");
            } else {
                throw new Error(data.message || "Erreur lors du lancement.");
            }
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            setTimeout(() => { btnReingest.disabled = false; }, 3000);
        }
    });

    // --- FONCTIONS UTILS (UI) ---

    function setLoadingState(isLoading) {
        if (isLoading) {
            typingIndicator.style.display = 'flex';
            btnSubmit.disabled = true;
            userQuery.disabled = true;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            typingIndicator.style.display = 'none';
            btnSubmit.disabled = false;
            userQuery.disabled = false;
            userQuery.focus();
        }
    }

    function appendMessage(text, sender, sources = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.innerHTML = sender === 'system' 
            ? '<i class="fa-solid fa-robot"></i>' 
            : '<i class="fa-solid fa-user"></i>';

        const body = document.createElement('div');
        body.className = 'message-body';
        
        if (sender === 'system') {
            body.innerHTML = parseMarkdown(text);
            
            // Rendu des sources sous forme d'accordeons DSFR
            if (sources && sources.length > 0) {
                const sourcesSection = document.createElement('div');
                sourcesSection.className = 'message-sources-section fr-mt-3v';
                
                const heading = document.createElement('p');
                heading.className = 'fr-text--lead fr-text--bold fr-mb-1v';
                heading.innerHTML = '<i class="fr-icon-book-mark-line fr-mr-1v" aria-hidden="true"></i>Critères et tests RGAA associés :';
                sourcesSection.appendChild(heading);
                
                const accordionsGroup = document.createElement('div');
                accordionsGroup.className = 'sources-accordions';
                
                sources.forEach((src) => {
                    const details = document.createElement('details');
                    details.className = 'source-details';
                    details.id = `details-${src.id}`;
                    
                    const meta = src.metadata;
                    let displayTitle = '';
                    let badgeText = meta.type === 'critere' ? 'Critère' : 'Glossaire';
                    let subtitle = '';

                    if (meta.type === 'critere') {
                        displayTitle = `Critère ${meta.critere} — ${meta.theme}`;
                        subtitle = `WCAG: ${meta.wcag || 'N/A'}`;
                    } else if (meta.type === 'glossaire') {
                        displayTitle = `Glossaire — ${meta.terme}`;
                        subtitle = `Définition`;
                    }
                    
                    const summary = document.createElement('summary');
                    summary.innerHTML = `
                        <span class="fr-badge fr-badge--info fr-mr-1v">${badgeText}</span>
                        <strong>${displayTitle}</strong>
                        <span class="fr-text--xs fr-ml-1v" style="color: var(--text-mention-grey);">${subtitle}</span>
                    `;
                    
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'details-content fr-p-2v';
                    contentDiv.innerHTML = `
                        <p class="fr-text--sm fr-mb-0" style="white-space: pre-wrap;">${escapeHTML(src.text_snippet)}</p>
                    `;
                    
                    details.appendChild(summary);
                    details.appendChild(contentDiv);
                    accordionsGroup.appendChild(details);
                });
                
                sourcesSection.appendChild(accordionsGroup);
                body.appendChild(sourcesSection);
            }
            
            // Clic sur les badges de criteres pour ouvrir l'accordeon correspondant
            body.querySelectorAll('.critere-badge').forEach(badge => {
                badge.addEventListener('click', () => {
                    const targetId = badge.getAttribute('data-target').replace('critere-', 'details-critere-');
                    const detailsEl = body.querySelector(`#${targetId}`);
                    if (detailsEl) {
                        detailsEl.open = true;
                        detailsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        detailsEl.classList.add('highlight-pulse');
                        setTimeout(() => {
                            detailsEl.classList.remove('highlight-pulse');
                        }, 2000);
                    }
                });
            });
        } else {
            body.textContent = text;
        }

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(body);
        chatMessages.appendChild(msgDiv);
        
        // Scroll automatique vers le bas
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Parser markdown fait maison
    function parseMarkdown(md) {
        let html = md;
        
        // On gere les blocs de code
        const codeBlocks = [];
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
            codeBlocks.push(`<pre><code class="language-${lang}">${escapeHTML(code.trim())}</code></pre>`);
            return placeholder;
        });

        // Code inline
        const inlineCodes = [];
        html = html.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
            inlineCodes.push(`<code>${escapeHTML(code)}</code>`);
            return placeholder;
        });

        // Securite basic pour echapper le html
        html = escapeHTML(html);

        // On remet les blocs de code et inline
        codeBlocks.forEach((block, idx) => {
            html = html.replace(`__CODE_BLOCK_PLACEHOLDER_${idx}__`, block);
        });
        inlineCodes.forEach((code, idx) => {
            html = html.replace(`__INLINE_CODE_PLACEHOLDER_${idx}__`, code);
        });

        // Detection des references aux criteres pour en faire des badges cliquables
        html = html.replace(/(Critère|critère)\s+(\d+\.\d+)/g, (match, word, num) => {
            return `<span class="critere-badge" data-target="critere-${num}" role="button" tabindex="0" title="Afficher la source du critère ${num}">${word} ${num}</span>`;
        });

        // Gras
        html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');

        // Italique
        html = html.replace(/\*([\s\S]*?)\*/g, '<em>$1</em>');

        // Titres
        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

        // Remplacement des sauts de ligne
        const parts = html.split(/(<\/pre>|<pre>)/);
        let inPre = false;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '<pre>') inPre = true;
            else if (parts[i] === '</pre>') inPre = false;
            else if (!inPre) {
                // Remplacer les nouvelles lignes par des sauts de ligne sémantiques ou paragraphes
                parts[i] = parts[i].replace(/\n/g, '<br>');
            }
        }
        html = parts.join('');

        return html;
    }

    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Notifications Toast
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-info-circle';
        if (type === 'success') iconClass = 'fa-check-circle';
        if (type === 'error') iconClass = 'fa-exclamation-circle';

        toast.innerHTML = `
            <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);
        
        // Effet de fadeOut apres 3s
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => { toast.remove(); }, 300);
        }, 3000);
    }
});
