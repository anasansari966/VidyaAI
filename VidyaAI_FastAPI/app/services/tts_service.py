import logging
import re
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from html import escape
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_POLLY_TEXT_CHUNK_SIZE = 2800
_OPENAI_TTS_LIMIT = 4096
_EMOTION_TAG_RE = re.compile(
    r"\[(?:calm|happy|excited|thoughtful|encouraging|pause|whisper|emphasis)\]\s*",
    re.IGNORECASE,
)

# Persona → Polly SSML styling (keep voice-safe: many Indic voices reject domain/emphasis/pitch)
_PERSONA_SSML: dict[str, dict[str, str | int | None]] = {
    "warm": {
        "prosody": 'rate="95%"',
        "break_ms": 700,
        "domain": None,
    },
    "calm": {
        "prosody": 'rate="85%"',
        "break_ms": 900,
        "domain": None,
    },
    "happy": {
        "prosody": 'rate="105%"',
        "break_ms": 500,
        "domain": None,
    },
    "energetic": {
        "prosody": 'rate="110%"',
        "break_ms": 400,
        "domain": None,
    },
}

# Voices known to reject conversational domain / rich SSML (use plain text or minimal SSML)
_SSML_LIMITED_VOICES = {
    "kajal",
    "aditi",
    "raveena",
    "amy",  # some regions
}


def normalize_persona(persona: str | None) -> str:
    value = (persona or "warm").strip().lower()
    return value if value in _PERSONA_SSML else "warm"


def strip_emotion_tags(text: str) -> str:
    """Remove legacy bracket tags — Polly does not speak these as emotions."""
    cleaned = _EMOTION_TAG_RE.sub("", text)
    return cleaned


def prepare_script_for_tts(script: str) -> str:
    """Strip markdown, emotion tags, and special characters so TTS sounds natural."""
    lines: list[str] = []
    for line in script.splitlines():
        stripped = line.strip()
        if stripped in {"---", "***", "___"}:
            lines.append("")
            continue
        # Skip ascii/markdown table-only lines
        if re.fullmatch(r"[\s|:\-+_=]+", stripped or ""):
            continue
        if stripped.startswith("#"):
            stripped = re.sub(r"^#+\s*", "", stripped)
        stripped = re.sub(r"\*\*(.+?)\*\*", r"\1", stripped)
        stripped = re.sub(r"\*(.+?)\*", r"\1", stripped)
        stripped = re.sub(r"`([^`]+)`", r"\1", stripped)
        stripped = strip_emotion_tags(stripped)
        # Remove symbols TTS would awkwardly spell out
        stripped = stripped.replace("|", " ")
        stripped = re.sub(r"[#*_~`<>\[\]{}\\/^]+", " ", stripped)
        stripped = re.sub(r"[=]{2,}", " ", stripped)
        stripped = re.sub(r"[-_]{3,}", " ", stripped)
        stripped = re.sub(r"[•●○▪▸►]+", " ", stripped)
        stripped = re.sub(r"\s+", " ", stripped).strip()
        if stripped:
            lines.append(stripped)
    text = "\n\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Final pass: no leftover pipe tables / code-ish glyphs
    text = re.sub(r"[|]+", " ", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _persona_profile(persona: str | None) -> dict[str, str | int | None]:
    return _PERSONA_SSML[normalize_persona(persona)]


def _voice_supports_rich_ssml(voice_id: str | None) -> bool:
    return (voice_id or "").strip().lower() not in _SSML_LIMITED_VOICES


def _wrap_paragraph_ssml(paragraph: str, profile: dict[str, str | int | None], *, minimal: bool) -> str:
    safe = escape(paragraph.strip())
    if not safe:
        return ""

    break_ms = profile["break_ms"]
    if minimal:
        # Kajal / limited voices: only breaks — no domain, emphasis, or pitch
        return f'{safe}<break time="{break_ms}ms"/>'

    prosody = profile["prosody"]
    return f'<prosody {prosody}>{safe}</prosody><break time="{break_ms}ms"/>'


def build_persona_ssml(text: str, persona: str | None = None, *, voice_id: str | None = None) -> str:
    """Wrap lecture text in persona-aware Polly SSML (voice-safe)."""
    profile = _persona_profile(persona)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()]

    minimal = not _voice_supports_rich_ssml(voice_id)
    blocks = [_wrap_paragraph_ssml(p, profile, minimal=minimal) for p in paragraphs]
    blocks = [b for b in blocks if b]
    inner = "".join(blocks)

    domain = profile.get("domain")
    if domain and not minimal:
        inner = f'<amazon:domain name="{domain}">{inner}</amazon:domain>'

    return f"<speak>{inner}</speak>"


def _chunk_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
            current = ""

        if len(paragraph) <= max_chars:
            current = paragraph
            continue

        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            candidate = f"{current} {sentence}".strip() if current else sentence
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                if len(sentence) <= max_chars:
                    current = sentence
                else:
                    for i in range(0, len(sentence), max_chars):
                        chunks.append(sentence[i : i + max_chars])
                    current = ""

    if current:
        chunks.append(current)

    return chunks


def _get_openai_client() -> OpenAI:
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=settings.openai_api_key)


def _polly_service_region() -> str:
    return (settings.polly_region or settings.aws_region or "ap-southeast-1").strip()


def _get_polly_client():
    if not settings.aws_access_key_id or not settings.aws_secret_access_key:
        raise ValueError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Polly TTS")
    return boto3.client(
        "polly",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=_polly_service_region(),
    )


def _synthesize_polly_chunk(
    client,
    *,
    text: str,
    text_type: str,
    voice_id: str,
    engine: str,
) -> bytes:
    response = client.synthesize_speech(
        Text=text,
        TextType=text_type,
        OutputFormat="mp3",
        VoiceId=voice_id,
        Engine=engine,
    )
    return response["AudioStream"].read()


def _polly_chunk_audio(
    client,
    chunk: str,
    index: int,
    voice_id: str,
    *,
    persona: str | None = None,
) -> bytes:
    """Synthesize with voice-safe SSML, then plain-text neural/generative fallbacks."""
    cleaned = strip_emotion_tags(chunk).strip()
    if not cleaned:
        raise ValueError("Empty TTS chunk")

    persona_key = normalize_persona(persona)
    preferred = settings.polly_engine.strip().lower() or "neural"

    attempts: list[tuple[str, str, str]] = []

    # 1) Minimal / rich SSML on neural when enabled
    if settings.polly_use_ssml:
        ssml = build_persona_ssml(cleaned, persona_key, voice_id=voice_id)
        attempts.append(("neural", "ssml", ssml))

    # 2) Plain text on preferred engine
    attempts.append((preferred if preferred in {"neural", "generative", "standard"} else "neural", "text", cleaned))

    # 3) Alternate plain-text engines so one unsupported combo never hard-fails the lecture
    for engine in ("neural", "generative", "standard"):
        if not any(a[0] == engine and a[1] == "text" for a in attempts):
            attempts.append((engine, "text", cleaned))

    last_error: Exception | None = None
    for engine, text_type, payload in attempts:
        try:
            return _synthesize_polly_chunk(
                client,
                text=payload,
                text_type=text_type,
                voice_id=voice_id,
                engine=engine,
            )
        except (ClientError, BotoCoreError) as exc:
            last_error = exc
            logger.warning(
                "Polly chunk %s failed (%s/%s persona=%s voice=%s): %s",
                index,
                engine,
                text_type,
                persona_key,
                voice_id,
                exc,
            )

    if last_error:
        raise last_error
    raise RuntimeError("Polly synthesis failed with no attempts")


def count_polly_chunks(script: str) -> int:
    spoken_text = prepare_script_for_tts(script)
    return len(_chunk_text(spoken_text, _POLLY_TEXT_CHUNK_SIZE))


def synthesize_speech_bytes(
    text: str,
    *,
    voice_id: str | None = None,
    max_chars: int = 3000,
    persona: str | None = "warm",
) -> bytes:
    """Short one-shot synthesis for support replies."""
    client = _get_polly_client()
    resolved_voice = voice_id or settings.polly_voice_id
    spoken = prepare_script_for_tts(text)[:max_chars]
    if not spoken:
        raise ValueError("No text to synthesize")
    return _polly_chunk_audio(client, spoken, 1, resolved_voice, persona=persona)


def _generate_polly_audio(
    script: str,
    output_path: Path,
    *,
    voice_id: str | None = None,
    persona: str | None = None,
    on_chunk: Callable[[int, int], None] | None = None,
) -> None:
    client = _get_polly_client()
    resolved_voice = voice_id or settings.polly_voice_id
    spoken_text = prepare_script_for_tts(script)
    text_chunks = _chunk_text(spoken_text, _POLLY_TEXT_CHUNK_SIZE)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    total_chunks = len(text_chunks)
    completed = 0
    lock = threading.Lock()

    def synthesize(index: int, chunk: str) -> tuple[int, bytes]:
        nonlocal completed
        logger.info(
            "Polly TTS persona=%s engine=%s region=%s chunk %s/%s",
            normalize_persona(persona),
            settings.polly_engine,
            _polly_service_region(),
            index,
            total_chunks,
        )
        audio = _polly_chunk_audio(client, chunk, index, resolved_voice, persona=persona)
        if on_chunk:
            with lock:
                completed += 1
                on_chunk(completed, total_chunks)
        return index, audio

    workers = max(1, min(settings.polly_max_workers, total_chunks))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(lambda item: synthesize(*item), enumerate(text_chunks, start=1)))

    results.sort(key=lambda item: item[0])
    output_path.write_bytes(b"".join(audio for _, audio in results))


def _generate_openai_audio(script: str, output_path: Path) -> None:
    client = _get_openai_client()
    spoken_text = prepare_script_for_tts(script)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    response = client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=spoken_text[:_OPENAI_TTS_LIMIT],
    )
    response.stream_to_file(str(output_path))


def generate_audio(
    script: str,
    output_path: Path,
    *,
    voice_id: str | None = None,
    persona: str | None = None,
    on_chunk: Callable[[int, int], None] | None = None,
) -> None:
    provider = settings.tts_provider.lower().strip()

    if provider == "polly":
        _generate_polly_audio(
            script,
            output_path,
            voice_id=voice_id,
            persona=persona,
            on_chunk=on_chunk,
        )
        return

    if provider == "openai":
        _generate_openai_audio(script, output_path)
        return

    raise ValueError(f"Unsupported TTS_PROVIDER: {settings.tts_provider!r}. Use 'polly' or 'openai'.")


def generate_audio_with_timeline(
    script: str,
    output_path: Path,
    *,
    voice_id: str | None = None,
    persona: str | None = None,
    on_chunk: Callable[[int, int], None] | None = None,
    max_segments: int | None = None,
) -> list[dict]:
    """
    Generate lecture audio and a teaching timeline that board frames can share.

    Each timeline item: {text, start_seconds, duration_seconds}.
    Segments match board generation so voice + board start in the same context.
    """
    from app.services.visual_service import split_script_into_segments
    from app.utils.mp3_duration import mp3_duration_seconds

    spoken_text = prepare_script_for_tts(script)
    if not spoken_text.strip():
        raise ValueError("No text to synthesize")

    limit = max(3, min(max_segments or settings.max_visual_frames, 10))
    teaching_segments = split_script_into_segments(spoken_text, max_segments=limit)
    if not teaching_segments:
        teaching_segments = [spoken_text[:2000]]

    provider = settings.tts_provider.lower().strip()
    resolved_voice = voice_id or settings.polly_voice_id
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # OpenAI path: one shot audio + word-weighted timeline scaled to measured duration.
    if provider == "openai":
        _generate_openai_audio(script, output_path)
        total = mp3_duration_seconds(output_path.read_bytes())
        if total <= 0:
            total = max(len(spoken_text.split()) / max(settings.words_per_minute, 1) * 60, len(teaching_segments) * 8)
        from app.services.visual_service import segment_timings

        timings = segment_timings(teaching_segments, total)
        return [
            {
                "text": text,
                "start_seconds": round(start, 2),
                "duration_seconds": round(dur, 2),
            }
            for text, (start, dur) in zip(teaching_segments, timings)
        ]

    if provider != "polly":
        raise ValueError(f"Unsupported TTS_PROVIDER: {settings.tts_provider!r}. Use 'polly' or 'openai'.")

    client = _get_polly_client()
    audio_parts: list[bytes] = []
    timeline: list[dict] = []
    cursor = 0.0
    total_poly_chunks = sum(len(_chunk_text(seg, _POLLY_TEXT_CHUNK_SIZE)) for seg in teaching_segments) or 1
    completed = 0

    for seg_index, segment in enumerate(teaching_segments, start=1):
        chunks = _chunk_text(segment, _POLLY_TEXT_CHUNK_SIZE) or [segment[:_POLLY_TEXT_CHUNK_SIZE]]
        seg_audio = b""
        for chunk_i, chunk in enumerate(chunks, start=1):
            logger.info(
                "Polly TTS timeline persona=%s segment %s/%s chunk %s/%s",
                normalize_persona(persona),
                seg_index,
                len(teaching_segments),
                chunk_i,
                len(chunks),
            )
            part = _polly_chunk_audio(client, chunk, completed + 1, resolved_voice, persona=persona)
            seg_audio += part
            completed += 1
            if on_chunk:
                on_chunk(completed, total_poly_chunks)

        measured = mp3_duration_seconds(seg_audio)
        if measured <= 0:
            measured = max(len(segment.split()) / max(settings.words_per_minute, 1) * 60, 4.0)

        timeline.append(
            {
                "text": segment,
                "start_seconds": round(cursor, 2),
                "duration_seconds": round(measured, 2),
            }
        )
        cursor += measured
        audio_parts.append(seg_audio)

    output_path.write_bytes(b"".join(audio_parts))
    logger.info(
        "Generated synced lecture audio with %s teaching segment(s), total ~%.1fs",
        len(timeline),
        cursor,
    )
    return timeline
