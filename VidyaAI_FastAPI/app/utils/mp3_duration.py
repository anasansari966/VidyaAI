"""Best-effort MP3 duration helpers (no extra dependency)."""

from __future__ import annotations

from pathlib import Path

# MPEG1 Layer III bitrates (kbps) indexed by bitrate bits
_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_SAMPLE_RATES_V1 = [44100, 48000, 32000]
_SAMPLE_RATES_V2 = [22050, 24000, 16000]


def mp3_duration_seconds(data: bytes | None) -> float:
    """Walk MPEG frames and sum duration. Returns 0 if parsing fails."""
    if not data:
        return 0.0

    i = 0
    n = len(data)
    # Skip ID3v2
    if n >= 10 and data[0:3] == b"ID3":
        size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        i = 10 + size

    duration = 0.0
    frames = 0
    guard = 0
    while i + 4 < n and guard < 2_000_000:
        guard += 1
        if data[i] != 0xFF or (data[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue

        b1 = data[i + 1]
        b2 = data[i + 2]
        version_bits = (b1 >> 3) & 0x03
        layer_bits = (b1 >> 1) & 0x03
        if version_bits == 1 or layer_bits != 1:  # not Layer III
            i += 1
            continue

        bitrate_idx = (b2 >> 4) & 0x0F
        sample_idx = (b2 >> 2) & 0x03
        padding = (b2 >> 1) & 0x01
        if bitrate_idx == 0 or bitrate_idx == 15 or sample_idx == 3:
            i += 1
            continue

        mpeg1 = version_bits == 3
        bitrate = (_BITRATES_V1_L3 if mpeg1 else _BITRATES_V2_L3)[bitrate_idx] * 1000
        sample_rate = (_SAMPLE_RATES_V1 if mpeg1 else _SAMPLE_RATES_V2)[sample_idx]
        samples_per_frame = 1152 if mpeg1 else 576
        frame_len = (samples_per_frame // 8 * bitrate) // sample_rate + padding
        if frame_len < 4:
            i += 1
            continue

        duration += samples_per_frame / float(sample_rate)
        frames += 1
        i += frame_len

    return duration if frames > 3 else 0.0


def mp3_file_duration_seconds(path: Path | str) -> float:
    try:
        return mp3_duration_seconds(Path(path).read_bytes())
    except OSError:
        return 0.0
