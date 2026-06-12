import os
from groq import Groq
import config

def get_groq_client():
    # Initialise le client Groq avec la clé API
    if not config.GROQ_API_KEY:
        raise ValueError(
            "La clé API Groq n'a pas été trouvée. "
            "Veuillez définir 'GROQ_API_KEY' ou 'groq_key' dans votre fichier .env."
        )
    return Groq(api_key=config.GROQ_API_KEY)

def generate_response(query: str, retrieved_contexts: list[dict]) -> str:
    # Génère une réponse via Groq en injectant les critères trouvés
    try:
        client = get_groq_client()
    except ValueError as e:
        return f"Erreur de configuration : {str(e)}"

    # On prépare le texte des critères récupérés pour le prompt
    context_str = ""
    for i, item in enumerate(retrieved_contexts, 1):
        context_str += f"\n--- DOCUMENT DE CONTEXTE {i} ---\n"
        context_str += f"ID: {item['id']}\n"
        context_str += f"Contenu:\n{item['text']}\n"
        context_str += "-------------------------------\n"

    # Prompt système pour guider l'assistant RGAA
    system_prompt = (
        "Vous êtes un assistant IA expert en accessibilité numérique, spécialisé dans le RGAA 4.1 (Référentiel Général d'Amélioration de l'Accessibilité).\n"
        "Votre rôle est d'aider les développeurs web à comprendre et à respecter les critères du RGAA.\n\n"
        "Directives de réponse :\n"
        "1. Répondez de manière structurée, concise, claire et pédagogique en français.\n"
        "2. Fondez-vous prioritairement sur les documents de contexte fournis (qui contiennent des critères et définitions officiels du RGAA).\n"
        "3. Citez TOUJOURS explicitement les numéros des critères du RGAA (ex: 'Critère 1.2') et les tests associés pertinents pour répondre à la question.\n"
        "4. Fournissez des exemples de code concret (HTML, CSS ou JavaScript) conformes et accessibles, en expliquant pourquoi cette implémentation respecte le RGAA.\n"
        "5. Si la question dépasse les documents fournis ou nécessite des précisions, mentionnez-le honnêtement tout en donnant la meilleure recommandation d'accessibilité possible.\n"
        "6. Utilisez le format Markdown pour structurer votre réponse (titres, listes, blocs de code)."
    )

    user_content = (
        f"Voici la question du développeur : {query}\n\n"
        f"Voici les critères et définitions du RGAA récupérés pour vous aider à répondre :\n"
        f"{context_str}\n"
        f"Générez une réponse claire, avec des exemples de code si pertinent, en citant les critères."
    )

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            model=config.GROQ_MODEL,
            temperature=0.2,
            max_tokens=1500
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        return f"Une erreur est survenue lors de la génération de la réponse via Groq : {str(e)}"

def generate_response_stream(query: str, retrieved_contexts: list[dict]):
    # Même chose que generate_response mais en mode streaming (générateur)
    try:
        client = get_groq_client()
    except ValueError as e:
        yield f"Erreur de configuration : {str(e)}"
        return

    # On formate les contextes
    context_str = ""
    for i, item in enumerate(retrieved_contexts, 1):
        context_str += f"\n--- DOCUMENT DE CONTEXTE {i} ---\n"
        context_str += f"ID: {item['id']}\n"
        context_str += f"Contenu:\n{item['text']}\n"
        context_str += "-------------------------------\n"

    system_prompt = (
        "Vous êtes un assistant IA expert en accessibilité numérique, spécialisé dans le RGAA 4.1 (Référentiel Général d'Amélioration de l'Accessibilité).\n"
        "Votre rôle est d'aider les développeurs web à comprendre et à respecter les critères du RGAA.\n\n"
        "Directives de réponse :\n"
        "1. Répondez de manière structurée, concise, claire et pédagogique en français.\n"
        "2. Fondez-vous prioritairement sur les documents de contexte fournis (qui contiennent des critères et définitions officiels du RGAA).\n"
        "3. Citez TOUJOURS explicitement les numéros des critères du RGAA (ex: 'Critère 1.2') et les tests associés pertinents pour répondre à la question.\n"
        "4. Fournissez des exemples de code concret (HTML, CSS ou JavaScript) conformes et accessibles, en expliquant pourquoi cette implémentation respecte le RGAA.\n"
        "5. Si la question dépasse les documents fournis ou nécessite des précisions, mentionnez-le honnêtement tout en donnant la meilleure recommandation d'accessibilité possible.\n"
        "6. Utilisez le format Markdown pour structurer votre réponse (titres, listes, blocs de code)."
    )

    user_content = (
        f"Voici la question du développeur : {query}\n\n"
        f"Voici les critères et définitions du RGAA récupérés pour vous aider à répondre :\n"
        f"{context_str}\n"
        f"Générez une réponse claire, avec des exemples de code si pertinent, en citant les critères."
    )

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            model=config.GROQ_MODEL,
            temperature=0.2,
            max_tokens=1500,
            stream=True
        )
        for chunk in chat_completion:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as e:
        yield f"\n\nUne erreur est survenue lors de la génération de la réponse via Groq : {str(e)}"

