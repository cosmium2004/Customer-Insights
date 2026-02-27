from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="ML Service")


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {"status": "ok", "service": "ml-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
