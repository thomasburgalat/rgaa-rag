import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction, SentenceTransformerEmbeddingFunction
import config

def get_embedding_function():
    # Si on a la clé Mistral, on l'utilise 
    if config.MISTRAL_API_KEY:
        return OpenAIEmbeddingFunction(
            api_key=config.MISTRAL_API_KEY,
            api_base="https://api.mistral.ai/v1",
            model_name="mistral-embed",
        )
    # Sinon, fallback local (un peu lourd mais gratuit)
    return SentenceTransformerEmbeddingFunction(
        model_name="paraphrase-multilingual-mpnet-base-v2"
    )

def get_collection():
    # Connexion à la base ChromaDB locale
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
    return client.get_or_create_collection(
        config.COLLECTION_NAME, 
        embedding_function=get_embedding_function()
    )

def query_database(query_text: str, n_results: int = 5) -> list[dict]:
    # Recherche de critères dans ChromaDB
    collection = get_collection()
    results = collection.query(
        query_texts=[query_text],
        n_results=n_results
    )
    
    formatted_results = []
    if not results or not results["documents"] or len(results["documents"][0]) == 0:
        return formatted_results
        
    # On reformate la sortie pour l'utiliser plus facilement
    for doc_id, text, metadata in zip(results["ids"][0], results["documents"][0], results["metadatas"][0]):
        formatted_results.append({
            "id": doc_id,
            "text": text,
            "metadata": metadata
        })
        
    return formatted_results
