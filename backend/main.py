from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings
from database import create_tables, engine
from routers import portfolio, tags, snapshots, advisor


async def run_migrations():
    """Add new columns to existing tables if they don't exist yet, so deploys self-heal.
    (No entries needed yet — create_tables() builds the current schema on first boot.)"""
    migrations: list[str] = []
    if not migrations:
        return
    async with engine.begin() as conn:
        for sql in migrations:
            await conn.execute(text(sql))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await run_migrations()
    yield


app = FastAPI(title="Portfolio Rebalancer API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(tags.router)
app.include_router(snapshots.router)
app.include_router(advisor.router)


@app.get("/")
@app.head("/")
async def root():
    return {"status": "ok"}


@app.get("/health")
@app.head("/health")
async def health():
    return {"status": "ok"}
