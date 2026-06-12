import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv() # charge les clés d'API du fichier .env

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CHROMA_DIR = BASE_DIR / "chroma_db"

COLLECTION_NAME = "rgaa"

# Clés API pour Groq et Mistral
GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or os.environ.get("groq_key")
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY") or os.environ.get("mistral_key")

# Modèle LLM choisi sur Groq
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# Setup des dossiers de stockage
DATA_DIR.mkdir(exist_ok=True)
CHROMA_DIR.mkdir(exist_ok=True)
