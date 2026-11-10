"""Vector index for textbooks — chunk, embed, and semantic search (SQLite-backed)."""

import json
import logging
import math
import re
from typing import Any

from openai import OpenAI

from app.config import settings
from app.database import SessionLocal
from app.models.document_chunk import DocumentChunk
from app.utils.document_parser import extract_text_from_storage

logger = logging.getLogger(__name__)

_PAGE_MARKER = re.compile(r"^__VIDYAAI_PAGE_(\d+)__$")


def _get_client() -> OpenAI:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _split_text_into_chunks(full_text: str) -> list[dict[str, Any]]:
    """Split marked PDF text into overlapping chunks with page metadata."""
    chunk_size = settings.vector_chunk_chars
    overlap = settings.vector_chunk_overlap
    lines = full_text.splitlines()
    page_blocks: list[tuple[int, str]] = []
    current_page = 1
    current_lines: list[str] = []

    for line in lines:
        marker = _PAGE_MARKER.match(line.strip())
        if marker:
            if current_lines:
                page_blocks.append((current_page, "\n".join(current_lines).strip()))
            current_page = int(marker.group(1))
            current_lines = []
            continue
        current_lines.append(line)
    if current_lines:
        page_blocks.append((current_page, "\n".join(current_lines).strip()))

    if not page_blocks:
        text = full_text.strip()
        if not text:
            return []
        return [{"page_start": None, "page_end": None, "text": text[:50000]}]

    chunks: list[dict[str, Any]] = []
    buffer = ""
    buffer_start: int | None = None
    buffer_end: int | None = None

    def flush() -> None:
        nonlocal buffer, buffer_start, buffer_end
        text = buffer.strip()
        if len(text) >= 80:
            chunks.append(
                {
                    "page_start": buffer_start,
                    "page_end": buffer_end,
                    "text": text[:8000],
                }
            )
        buffer = ""
        buffer_start = None
        buffer_end = None

    for page_num, page_text in page_blocks:
        if not page_text:
            continue
        segment = f"\n\n[Page {page_num}]\n{page_text}"
        if not buffer:
            buffer_start = page_num
        buffer_end = page_num
        buffer += segment
        if len(buffer) >= chunk_size:
            flush()
            buffer = segment[-overlap:] if overlap else ""
            buffer_start = page_num
            buffer_end = page_num
    flush()
    return chunks


def _embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    batch_size = settings.vector_embed_batch_size
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        response = client.embeddings.create(model=settings.embedding_model, input=batch)
        ordered = sorted(response.data, key=lambda item: item.index)
        vectors.extend(item.embedding for item in ordered)
    return vectors


def index_book_text(
    book_id: int,
    file_ref: str,
    file_type: str,
    *,
    embed: bool = True,
    full_text: str | None = None,
) -> int:
    """Extract text, chunk, optionally embed, and store for a book."""
    db = SessionLocal()
    try:
        db.query(DocumentChunk).filter(DocumentChunk.book_id == book_id).delete()
        db.commit()
    finally:
        db.close()

    if full_text is None:
        full_text = extract_text_from_storage(file_ref, file_type)
    chunk_specs = _split_text_into_chunks(full_text)
    if not chunk_specs:
        return 0

    texts = [spec["text"] for spec in chunk_specs]
    embeddings: list[list[float] | None]
    if embed:
        try:
            embeddings = _embed_texts(texts)
        except Exception as exc:
            logger.warning("Embedding failed for book %s: %s — storing chunks without vectors", book_id, exc)
            embeddings = [None] * len(texts)
    else:
        embeddings = [None] * len(texts)

    db = SessionLocal()
    try:
        for index, spec in enumerate(chunk_specs):
            embedding = embeddings[index] if index < len(embeddings) else None
            db.add(
                DocumentChunk(
                    book_id=book_id,
                    chunk_index=index,
                    page_start=spec.get("page_start"),
                    page_end=spec.get("page_end"),
                    text_content=spec["text"],
                    embedding_json=json.dumps(embedding) if embedding else None,
                )
            )
        db.commit()
        return len(chunk_specs)
    finally:
        db.close()


def embed_book_chunks(book_id: int) -> int:
    """Background step — add search embeddings after the book is already usable."""
    db = SessionLocal()
    try:
        chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id, DocumentChunk.embedding_json.is_(None))
            .order_by(DocumentChunk.chunk_index)
            .all()
        )
        if not chunks:
            return 0
        texts = [chunk.text_content for chunk in chunks]
        vectors = _embed_texts(texts)
        for chunk, vector in zip(chunks, vectors):
            chunk.embedding_json = json.dumps(vector)
        db.commit()
        return len(chunks)
    finally:
        db.close()


def get_early_book_chunks(book_id: int, limit: int = 14) -> list[DocumentChunk]:
    """First sections of the book — used for chapter detection without slow AI search."""
    db = SessionLocal()
    try:
        return (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id)
            .order_by(DocumentChunk.chunk_index)
            .limit(limit)
            .all()
        )
    finally:
        db.close()


def search_book_chunks(book_id: int, query: str, *, top_k: int = 12) -> list[DocumentChunk]:
    """Return top-k chunks by cosine similarity to the query embedding."""
    db = SessionLocal()
    try:
        chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.book_id == book_id, DocumentChunk.embedding_json.isnot(None))
            .order_by(DocumentChunk.chunk_index)
            .all()
        )
        if not chunks:
            return (
                db.query(DocumentChunk)
                .filter(DocumentChunk.book_id == book_id)
                .order_by(DocumentChunk.chunk_index)
                .limit(top_k)
                .all()
            )

        query_vec = _embed_texts([query])[0]
        scored: list[tuple[float, DocumentChunk]] = []
        for chunk in chunks:
            vec = json.loads(chunk.embedding_json or "[]")
            if not vec:
                continue
            scored.append((_cosine_similarity(query_vec, vec), chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]
    finally:
        db.close()


def get_chapter_content_from_vectors(
    book_id: int,
    *,
    title: str,
    page_start: int | None,
    page_end: int | None,
    fallback: str = "",
) -> str:
    """Pull chapter text from indexed chunks (page range + semantic search)."""
    db = SessionLocal()
    try:
        if page_start and page_end:
            ranged = (
                db.query(DocumentChunk)
                .filter(
                    DocumentChunk.book_id == book_id,
                    DocumentChunk.page_start.isnot(None),
                    DocumentChunk.page_start <= page_end,
                    DocumentChunk.page_end >= page_start,
                )
                .order_by(DocumentChunk.chunk_index)
                .all()
            )
            if ranged:
                return "\n\n".join(chunk.text_content for chunk in ranged)[:50000]

        results = search_book_chunks(book_id, f"Chapter content: {title}", top_k=8)
        if results:
            return "\n\n".join(chunk.text_content for chunk in results)[:50000]
        return fallback
    finally:
        db.close()
