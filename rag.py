import json
import time
import database
import llm

def answer_query(query: str, n_results: int = 5) -> dict:
    # Fonction classique sans stream, renvoie un JSON direct
    print(f"RAG: Recherche de critères pour la requête : '{query}'")
    
    # On va chercher dans la base ChromaDB
    retrieved_docs = database.query_database(query, n_results=n_results)
    
    if not retrieved_docs:
        warning_msg = (
            "Attention : Aucun critère RGAA n'a été trouvé dans la base vectorielle locale. "
            "Il se peut que l'ingestion n'ait pas encore été lancée ou que la base soit vide.\n\n"
        )
        answer = warning_msg + llm.generate_response(query, [])
        sources = []
    else:
        answer = llm.generate_response(query, retrieved_docs)
        sources = []
        for doc in retrieved_docs:
            sources.append({
                "id": doc["id"],
                "metadata": doc["metadata"],
                "text_snippet": doc["text"][:300] + "..." if len(doc["text"]) > 300 else doc["text"]
            })
            
    return {
        "query": query,
        "answer": answer,
        "sources": sources
    }

def answer_query_stream(query: str, n_results: int = 5):
    # Version avec streaming pour envoyer les morceaux de texte au fur et à mesure
    print(f"RAG (Stream): Recherche de critères pour la requête : '{query}'")
    retrieved_docs = database.query_database(query, n_results=n_results)
    
    # On récupère d'abord les sources pour le frontend
    sources = []
    if retrieved_docs:
        for doc in retrieved_docs:
            sources.append({
                "id": doc["id"],
                "metadata": doc["metadata"],
                "text_snippet": doc["text"][:300] + "..." if len(doc["text"]) > 300 else doc["text"]
            })
            
    yield json.dumps({"type": "sources", "data": sources}) + "\n"
    
    if not retrieved_docs:
        warning_msg = (
            "Attention : Aucun critère RGAA n'a été trouvé dans la base vectorielle locale. "
            "Il se peut que l'ingestion n'ait pas encore été lancée ou que la base soit vide.\n\n"
        )
        yield json.dumps({"type": "chunk", "data": warning_msg}) + "\n"
        time.sleep(0.03)
        
        for chunk in llm.generate_response_stream(query, []):
            yield json.dumps({"type": "chunk", "data": chunk}) + "\n"
            time.sleep(0.03) # Petit sleep de 30ms pour que ce soit lisible
    else:
        for chunk in llm.generate_response_stream(query, retrieved_docs):
            yield json.dumps({"type": "chunk", "data": chunk}) + "\n"
            time.sleep(0.03) # Petit sleep ici aussi
            
    yield json.dumps({"type": "done"}) + "\n"

