import time
import chromadb
from chromadb.api.types import EmbeddingFunction, Documents, Embeddings
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from openai import OpenAI
import config

class RobustMistralEmbeddingFunction(EmbeddingFunction):
    def __init__(self, api_key: str, model_name: str = "mistral-embed"):
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://api.mistral.ai/v1",
            max_retries=5
        )
        self.model_name = model_name

    def __call__(self, input: Documents) -> Embeddings:
        for attempt in range(5):
            try:
                response = self.client.embeddings.create(
                    model=self.model_name,
                    input=input
                )
                return [data.embedding for data in response.data]
            except Exception as e:
                if ("429" in str(e) or "rate" in str(e).lower() or "limit" in str(e).lower()) and attempt < 4:
                    time.sleep(2 * (attempt + 1))
                else:
                    raise e
        response = self.client.embeddings.create(
            model=self.model_name,
            input=input
        )
        return [data.embedding for data in response.data]

def get_embedding_function():
    # Si on a la clé Mistral, on l'utilise avec gestion du rate limit
    if config.MISTRAL_API_KEY:
        return RobustMistralEmbeddingFunction(
            api_key=config.MISTRAL_API_KEY,
            model_name="mistral-embed"
        )
    # Sinon, fallback local (gratuit)
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
