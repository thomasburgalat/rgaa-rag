import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv() # charge les clés d'API du fichier .env

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CHROMA_DIR = BASE_DIR / "chroma_db"

COLLECTION_NAME = "rgaa"

# Clé API pour Mistral
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY") or os.environ.get("mistral_key")

# Modèle LLM choisi sur Mistral AI
MISTRAL_MODEL = os.environ.get("MISTRAL_MODEL", "mistral-small-latest")

# Setup des dossiers de stockage
DATA_DIR.mkdir(exist_ok=True)
CHROMA_DIR.mkdir(exist_ok=True)
