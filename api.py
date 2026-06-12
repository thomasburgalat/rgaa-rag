from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from pathlib import Path

import config
import rag
import ingest_rgaa

app = FastAPI(
    title="RAG RGAA API",
    description="API pour interroger le référentiel RGAA 4.1 et aider les développeurs.",
    version="1.0.0"
)

# Config CORS pour le dev local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèles pour l'API
class QueryRequest(BaseModel):
    question: str
    n_results: int = 5

class QueryResponse(BaseModel):
    query: str
    answer: str
    sources: list

# Le dossier des fichiers statiques (html, css, js)
static_path = Path(__file__).resolve().parent / "static"
static_path.mkdir(exist_ok=True)

# Endpoint classique (JSON)
@app.post("/api/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="La question ne peut pas être vide.")
    try:
        result = rag.answer_query(request.question, n_results=request.n_results)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# Endpoint avec streaming
@app.post("/api/query_stream")
async def query_rag_stream(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="La question ne peut pas être vide.")
    try:
        return StreamingResponse(
            rag.answer_query_stream(request.question, n_results=request.n_results),
            media_type="application/x-ndjson"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

# Lancer la réindexation de la DB vectorielle
@app.post("/api/ingest")
async def trigger_ingestion(background_tasks: BackgroundTasks):
    try:
        # En tâche de fond pour pas que la requête HTTP timeout
        background_tasks.add_task(ingest_rgaa.run_ingestion)
        return {"status": "success", "message": "L'ingestion du RGAA a été lancée en arrière-plan."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Impossible de lancer l'ingestion: {str(e)}")

# On sert le dossier static sur la racine /
app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")

if __name__ == "__main__":
    print("Démarrage du serveur sur http://127.0.0.1:8000")
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)
