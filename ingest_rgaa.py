# Script pour télécharger et parser le référentiel RGAA 4.1, puis l'insérer dans ChromaDB.

import json
import os
import re
import urllib.request
import chromadb

import config
import database

BASE_URL = "https://raw.githubusercontent.com/DISIC/accessibilite.numerique.gouv.fr/main/RGAA"
FILES = ["criteres.json", "glossaire.json", "methodologies.json"]


# Téléchargement des JSON officiels
def download_sources() -> None:
    config.DATA_DIR.mkdir(exist_ok=True)
    for f in FILES:
        dest = config.DATA_DIR / f
        if not dest.exists():
            print(f"Téléchargement de {f}...")
            urllib.request.urlretrieve(f"{BASE_URL}/{f}", str(dest))


# Nettoyage du texte (Markdown / HTML)
MD_LINK = re.compile(r"\[([^\]]+)\]\(#[^)]*\)")
HTML_TAG = re.compile(r"<[^>]+>")

def clean_md(text: str) -> str:
    # Nettoie les liens internes Markdown
    return MD_LINK.sub(r"\1", text).replace("\xa0", " ").strip()

def clean_html(text: str) -> str:
    # Nettoie les balises HTML dans le glossaire
    text = HTML_TAG.sub(" ", text)
    return re.sub(r"\s+", " ", text).replace("\xa0", " ").strip()


# Construction des objets documents pour la base de données
def build_criteria_docs(criteres: dict, methodos: dict) -> list[dict]:
    docs = []
    for topic in criteres["topics"]:
        theme = topic["topic"]
        theme_num = topic["number"]
        for item in topic["criteria"]:
            crit = item["criterium"]
            crit_id = f"{theme_num}.{crit['number']}"

            # Récupération des WCAG
            wcag_refs = []
            for ref in crit.get("references", []):
                wcag_refs.extend(ref.get("wcag", []))

            # Concatenation des tests et méthodologies
            lines = [f"Critère {crit_id} ({theme}) : {clean_md(crit['title'])}", ""]
            for test_num, test_parts in crit.get("tests", {}).items():
                test_id = f"{crit_id}.{test_num}"
                test_text = " ".join(clean_md(p) for p in test_parts)
                lines.append(f"Test {test_id} : {test_text}")
                methodo = methodos.get(test_id)
                if methodo:
                    lines.append(f"Méthodologie {test_id} :\n{clean_md(methodo)}")
                lines.append("")

            docs.append({
                "id": f"critere-{crit_id}",
                "text": "\n".join(lines).strip(),
                "metadata": {
                    "type": "critere",
                    "critere": crit_id,
                    "theme": theme,
                    "theme_num": theme_num,
                    "wcag": ", ".join(wcag_refs),
                },
            })
    return docs

def build_glossary_docs(glossaire: dict) -> list[dict]:
    docs = []
    for i, entry in enumerate(glossaire["glossary"]):
        title = entry["title"].strip()
        body = clean_html(entry["body"])
        docs.append({
            "id": f"glossaire-{i}",
            "text": f"Définition RGAA — {title} : {body}",
            "metadata": {"type": "glossaire", "terme": title},
        })
    return docs


# Lancement de l'ingestion
def run_ingestion():
    download_sources()

    with open(config.DATA_DIR / "criteres.json", encoding="utf-8") as f:
        criteres = json.load(f)
    with open(config.DATA_DIR / "glossaire.json", encoding="utf-8") as f:
        glossaire = json.load(f)
    with open(config.DATA_DIR / "methodologies.json", encoding="utf-8") as f:
        methodos = json.load(f)

    docs = build_criteria_docs(criteres, methodos) + build_glossary_docs(glossaire)
    print(f"{len(docs)} documents construits "
          f"({sum(1 for d in docs if d['metadata']['type'] == 'critere')} critères, "
          f"{sum(1 for d in docs if d['metadata']['type'] == 'glossaire')} termes de glossaire)")

    # Reset de la collection existante pour éviter les doublons/erreurs de dimension
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
    try:
        client.delete_collection(config.COLLECTION_NAME)
        print(f"Collection '{config.COLLECTION_NAME}' supprimée.")
    except Exception:
        pass
        
    collection = client.create_collection(
        config.COLLECTION_NAME, 
        embedding_function=database.get_embedding_function()
    )

    # Ajout par paquets de 50 pour pas saturer l'API
    batch_size = 50
    for i in range(0, len(docs), batch_size):
        batch = docs[i:i + batch_size]
        collection.add(
            ids=[d["id"] for d in batch],
            documents=[d["text"] for d in batch],
            metadatas=[d["metadata"] for d in batch],
        )
        print(f"  Progression : {min(i + batch_size, len(docs))}/{len(docs)}")

    print(f"Terminé. Base persistée dans {config.CHROMA_DIR}")


if __name__ == "__main__":
    run_ingestion()
    
    # Petit test de recherche
    print("\n--- Test de récupération de critères ---")
    results = database.query_database("comment rendre une image accessible", n_results=2)
    for res in results:
        print(f"\nID: {res['id']}")
        print(f"Métadonnées: {res['metadata']}")
        print(f"Extrait: {res['text'][:150]}...")
