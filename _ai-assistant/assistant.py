from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional


APP_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = APP_DIR / "config.yaml"


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_config(path: Path) -> Dict[str, Any]:
    try:
        import yaml
    except ImportError as exc:
        raise SystemExit("缺少依赖 PyYAML，请先运行：python -m pip install -r _ai-assistant\\requirements.txt") from exc

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data


def cfg_get(config: Dict[str, Any], dotted: str, default: Any = None) -> Any:
    cur: Any = config
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def resolve_vault_root(config: Dict[str, Any]) -> Path:
    raw = cfg_get(config, "vault_path", ".")
    path = Path(raw)
    if not path.is_absolute():
        path = APP_DIR.parent / path
    return path.resolve()


def resolve_vault_path(vault_root: Path, raw: str | Path) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = vault_root / path
    return path


def write_state(config: Dict[str, Any], vault_root: Path, state: str, message: str, **extra: Any) -> None:
    if not cfg_get(config, "avatar.enabled", True):
        return
    state_file = resolve_vault_path(vault_root, cfg_get(config, "avatar.state_file", "_ai-assistant/avatar/state.json"))
    state_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"state": state, "message": message, "updated_at": now_iso(), **extra}
    state_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_action_log(config: Dict[str, Any], vault_root: Path, payload: Dict[str, Any]) -> None:
    if not cfg_get(config, "logging.enabled", True):
        return
    log_file = resolve_vault_path(vault_root, cfg_get(config, "logging.action_log", "_ai-assistant/logs/actions.jsonl"))
    log_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"time": now_iso(), **payload}
    with log_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def get_current_note(config: Dict[str, Any], vault_root: Path) -> Optional[str]:
    state_file = resolve_vault_path(vault_root, cfg_get(config, "current_note.state_file", "_ai-assistant/current-note.json"))
    if state_file.exists():
        try:
            payload = json.loads(state_file.read_text(encoding="utf-8"))
            note_path = payload.get("path")
            if note_path:
                return str(note_path)
        except Exception:
            pass
    fallback = cfg_get(config, "current_note.fallback_path", "")
    return str(fallback) if fallback else None


def set_current_note(config: Dict[str, Any], vault_root: Path, note_path: str) -> Path:
    state_file = resolve_vault_path(vault_root, cfg_get(config, "current_note.state_file", "_ai-assistant/current-note.json"))
    state_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"path": note_path, "updated_at": now_iso()}
    state_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return state_file


def safe_print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("utf-8", errors="replace").decode("utf-8"))


def record_audio(config: Dict[str, Any], vault_root: Path, seconds: Optional[int], output: Optional[Path]) -> Path:
    try:
        import sounddevice as sd
        import soundfile as sf
    except ImportError as exc:
        raise SystemExit(
            "缺少录音依赖，请先运行：python -m pip install -r _ai-assistant\\requirements.txt"
        ) from exc

    seconds = seconds or int(cfg_get(config, "voice.record_seconds", 6))
    sample_rate = int(cfg_get(config, "voice.sample_rate", 16000))
    output = output or resolve_vault_path(vault_root, "_ai-assistant/audio/input/last.wav")
    output.parent.mkdir(parents=True, exist_ok=True)

    write_state(config, vault_root, "listening", f"正在录音 {seconds} 秒")
    safe_print(f"开始录音 {seconds} 秒，请说话……")
    audio = sd.rec(int(seconds * sample_rate), samplerate=sample_rate, channels=1, dtype="float32")
    sd.wait()
    sf.write(str(output), audio, sample_rate)
    safe_print(f"录音已保存：{output}")
    return output


class ManualRecorder:
    """Long-lived recorder used by server mode.

    The old CLI flow records a fixed number of seconds via `sd.rec(...)`. Server
    mode needs push-to-start / push-to-stop, so we keep a sounddevice InputStream
    open and append chunks until the UI asks us to stop.
    """

    def __init__(self, config: Dict[str, Any], vault_root: Path):
        self.config = config
        self.vault_root = vault_root
        self.sample_rate = int(cfg_get(config, "voice.sample_rate", 16000))
        self.stream = None
        self.chunks = []
        self.output: Optional[Path] = None
        self.started_at: Optional[datetime] = None
        self.lock = threading.Lock()
        self._np = None
        self._sf = None

    def is_recording(self) -> bool:
        with self.lock:
            return self.stream is not None

    def start(self, output: Optional[Path] = None) -> Dict[str, Any]:
        try:
            import numpy as np
            import sounddevice as sd
            import soundfile as sf
        except ImportError as exc:
            raise RuntimeError("缺少录音依赖，请先运行：python -m pip install -r _ai-assistant\\requirements.txt") from exc

        with self.lock:
            if self.stream is not None:
                raise RuntimeError("录音已经在进行中。")

            self._np = np
            self._sf = sf
            self.chunks = []
            self.output = output or resolve_vault_path(self.vault_root, "_ai-assistant/audio/input/last.wav")
            self.output.parent.mkdir(parents=True, exist_ok=True)
            self.started_at = datetime.now().astimezone()

            def callback(indata, frames, time_info, status):  # noqa: ANN001 - sounddevice callback shape
                if status:
                    safe_print(f"录音状态：{status}")
                with self.lock:
                    self.chunks.append(indata.copy())

            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                callback=callback,
            )
            self.stream.start()

        write_state(self.config, self.vault_root, "listening", "正在录音，点击停止后开始识别")
        return {"recording": True, "output": str(self.output), "started_at": self.started_at.isoformat()}

    def stop(self) -> Dict[str, Any]:
        with self.lock:
            if self.stream is None:
                raise RuntimeError("当前没有正在进行的录音。")
            stream = self.stream
            chunks = list(self.chunks)
            output = self.output or resolve_vault_path(self.vault_root, "_ai-assistant/audio/input/last.wav")
            started_at = self.started_at
            self.stream = None
            self.chunks = []
            self.output = None
            self.started_at = None
            np = self._np
            sf = self._sf

        stream.stop()
        stream.close()

        if not chunks:
            audio = np.zeros((0, 1), dtype="float32")
        else:
            audio = np.concatenate(chunks, axis=0)
        sf.write(str(output), audio, self.sample_rate)
        duration_seconds = float(len(audio) / self.sample_rate) if self.sample_rate else 0.0
        write_state(self.config, self.vault_root, "transcribing", "录音已结束，准备识别")
        return {
            "recording": False,
            "output": str(output),
            "duration_seconds": duration_seconds,
            "started_at": started_at.isoformat() if started_at else None,
            "stopped_at": now_iso(),
        }


def transcribe_openai(config: Dict[str, Any], audio_path: Path) -> str:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise SystemExit("缺少 openai 依赖，请先运行：python -m pip install -r _ai-assistant\\requirements.txt") from exc

    ensure_openai_api_key_loaded()
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit(
            "OPENAI_API_KEY 未设置，无法使用 OpenAI STT。"
            "请先在 PowerShell 中设置：$env:OPENAI_API_KEY=\"你的 API key\"，"
            "或把 _ai-assistant/config.yaml 里的 voice.stt_provider 改成 faster-whisper。"
        )

    model = cfg_get(config, "voice.openai_stt_model", "gpt-4o-mini-transcribe")
    language = cfg_get(config, "voice.language", "zh")
    client = OpenAI()
    with audio_path.open("rb") as f:
        kwargs: Dict[str, Any] = {"model": model, "file": f}
        if language:
            kwargs["language"] = language
        result = client.audio.transcriptions.create(**kwargs)
    text = getattr(result, "text", None)
    if text is None and isinstance(result, dict):
        text = result.get("text")
    return (text or "").strip()


def ensure_openai_api_key_loaded() -> None:
    """Best-effort loading for Windows user/machine env vars.

    If the key was set after Obsidian/Claudian/Codex started, child processes may
    not inherit it from the parent process. Querying the Windows registry lets us
    pick up persistent User/Machine environment variables without requiring a full
    application restart.
    """

    if os.getenv("OPENAI_API_KEY") or os.name != "nt":
        return
    try:
        import winreg

        candidates = [
            (winreg.HKEY_CURRENT_USER, r"Environment"),
            (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
        ]
        for hive, subkey in candidates:
            try:
                with winreg.OpenKey(hive, subkey) as key:
                    value, _typ = winreg.QueryValueEx(key, "OPENAI_API_KEY")
                    if value:
                        os.environ["OPENAI_API_KEY"] = str(value)
                        return
            except FileNotFoundError:
                continue
            except OSError:
                continue
    except Exception:
        return


def transcribe_faster_whisper(config: Dict[str, Any], audio_path: Path) -> str:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "缺少 faster-whisper。请运行：python -m pip install -r _ai-assistant\\requirements-whisper.txt"
        ) from exc

    model_name = cfg_get(config, "voice.faster_whisper_model", "small")
    device = cfg_get(config, "voice.faster_whisper_device", "auto")
    compute_type = cfg_get(config, "voice.faster_whisper_compute_type", "auto")
    language = cfg_get(config, "voice.language", "zh") or None

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(str(audio_path), language=language)
    return "".join(segment.text for segment in segments).strip()


def transcribe_audio(config: Dict[str, Any], vault_root: Path, audio_path: Path) -> str:
    provider = cfg_get(config, "voice.stt_provider", "openai")
    write_state(config, vault_root, "transcribing", f"正在使用 {provider} 识别语音")
    if provider == "openai":
        return transcribe_openai(config, audio_path)
    if provider == "faster-whisper":
        return transcribe_faster_whisper(config, audio_path)
    raise SystemExit(f"未知 STT provider：{provider}")


def speak_windows_sapi(text: str) -> None:
    if os.name != "nt":
        safe_print(text)
        return
    script = "$s = New-Object -ComObject SAPI.SpVoice; $s.Speak([Console]::In.ReadToEnd()) | Out-Null"
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        input=text,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def play_audio_file(path: Path, config: Dict[str, Any]) -> None:
    if not cfg_get(config, "tts.play_audio", True):
        return
    ffplay = shutil.which("ffplay")
    if ffplay:
        subprocess.run([ffplay, "-nodisp", "-autoexit", "-loglevel", "quiet", str(path)], check=False)
        return
    if os.name == "nt":
        # 非阻塞兜底：用系统默认播放器打开。若想阻塞播放，可安装 ffmpeg/ffplay。
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    safe_print(f"音频已生成：{path}")


async def speak_edge_tts_async(config: Dict[str, Any], vault_root: Path, text: str) -> Path:
    try:
        import edge_tts
    except ImportError as exc:
        raise RuntimeError("缺少 edge-tts") from exc

    voice = cfg_get(config, "tts.edge_voice", "zh-CN-XiaoxiaoNeural")
    output = resolve_vault_path(vault_root, "_ai-assistant/audio/output/last.mp3")
    output.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output))
    return output


def speak(config: Dict[str, Any], vault_root: Path, text: str) -> None:
    provider = cfg_get(config, "tts.provider", "edge-tts")
    write_state(config, vault_root, "speaking", text[:80])
    safe_print(f"语音播报：{text}")
    try:
        if provider == "none":
            return
        if provider == "windows-sapi":
            speak_windows_sapi(text)
            return
        if provider == "edge-tts":
            output = asyncio.run(speak_edge_tts_async(config, vault_root, text))
            play_audio_file(output, config)
            return
        raise RuntimeError(f"未知 TTS provider：{provider}")
    except Exception as exc:
        fallback = cfg_get(config, "tts.fallback_provider", "windows-sapi")
        safe_print(f"TTS provider {provider} 失败：{exc}")
        if fallback == "windows-sapi":
            speak_windows_sapi(text)


HIGH_RISK_PATTERNS = [
    r"删除",
    r"清空",
    r"移除",
    r"覆盖",
    r"重命名",
    r"移动",
    r"批量",
    r"全部",
    r"所有",
    r"delete",
    r"remove",
    r"rename",
    r"move",
    r"overwrite",
    r"shell",
    r"命令行",
]


WRITE_PATTERNS = [
    r"写入",
    r"追加",
    r"添加",
    r"修改",
    r"整理",
    r"生成",
    r"创建",
    r"新建",
    r"改成",
    r"append",
    r"add",
    r"edit",
    r"create",
]


def classify_risk(user_text: str) -> Dict[str, Any]:
    lower = user_text.lower()
    high = any(re.search(pattern, lower, re.IGNORECASE) for pattern in HIGH_RISK_PATTERNS)
    write = high or any(re.search(pattern, lower, re.IGNORECASE) for pattern in WRITE_PATTERNS)
    risk = "high" if high else ("medium" if write else "low")
    return {"risk_level": risk, "needs_write": write}


def confirm_if_needed(config: Dict[str, Any], user_text: str, yes: bool = False) -> bool:
    risk = classify_risk(user_text)
    if yes or risk["risk_level"] == "low":
        return True
    safe_print("这个语音命令可能会修改或批量影响笔记：")
    safe_print(user_text)
    safe_print(f"风险等级：{risk['risk_level']}")
    answer = input("如果确认执行，请输入 YES：").strip()
    return answer == "YES"


def build_execution_prompt(config: Dict[str, Any], vault_root: Path, user_text: str) -> str:
    prompt_file = APP_DIR / "prompts" / "execution_prompt.md"
    template = prompt_file.read_text(encoding="utf-8")
    current_note = get_current_note(config, vault_root) or "未知"
    return template.format(
        vault_root=str(vault_root),
        current_note_path=current_note,
        user_text=user_text,
    )


def run_codex(config: Dict[str, Any], vault_root: Path, user_text: str, dry_run: bool = False) -> str:
    prompt = build_execution_prompt(config, vault_root, user_text)
    if dry_run:
        safe_print("Dry run：下面是将发送给 Codex 的 prompt：")
        safe_print(prompt)
        return "Dry run 已完成，没有实际调用 Codex。"

    codex_cmd = cfg_get(config, "execution.codex_command", "") or shutil.which("codex") or "codex"
    output_file = resolve_vault_path(vault_root, "_ai-assistant/logs/last-codex-message.md")
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # `--ask-for-approval` 是 Codex CLI 的全局选项，需要放在 `exec` 子命令之前；
    # 放在 `exec` 之后会被当前版本的 Codex CLI 判定为 unknown argument。
    cmd = [
        str(codex_cmd),
        "--ask-for-approval",
        cfg_get(config, "execution.approval_policy", "never"),
        "exec",
        "--cd",
        str(vault_root),
        "--sandbox",
        cfg_get(config, "execution.sandbox", "workspace-write"),
        "-o",
        str(output_file),
    ]
    if cfg_get(config, "execution.skip_git_repo_check", True):
        cmd.append("--skip-git-repo-check")
    model = cfg_get(config, "execution.model", "")
    if model:
        cmd.extend(["-m", str(model)])
    cmd.append("-")

    write_state(config, vault_root, "executing", "正在调用 Codex 执行任务")
    timeout = int(cfg_get(config, "execution.timeout_seconds", 900))
    proc = subprocess.run(
        cmd,
        input=prompt,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Codex 执行失败，退出码 {proc.returncode}\nSTDERR:\n{proc.stderr[-3000:]}")

    if output_file.exists():
        result = output_file.read_text(encoding="utf-8", errors="replace").strip()
    else:
        result = proc.stdout.strip()
    return result or "Codex 已执行完成，但没有返回文本结果。"


def summarize_heuristic(config: Dict[str, Any], result_text: str) -> str:
    max_chars = int(cfg_get(config, "summary.max_chars", 120))
    cleaned = re.sub(r"```.*?```", "", result_text, flags=re.S)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    parts = re.split(r"(?<=[。！？.!?])\s+|[\r\n]+", cleaned)
    sentence = next((p.strip() for p in parts if p.strip()), cleaned)
    sentence = sentence[:max_chars].rstrip()
    if not sentence:
        return "已完成。"
    if sentence.startswith(("已完成", "完成", "失败", "出错")):
        return sentence
    return f"已完成。{sentence}"


def summarize_openai(config: Dict[str, Any], user_text: str, result_text: str) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        return summarize_heuristic(config, result_text)

    prompt_file = APP_DIR / "prompts" / "result_summarizer.md"
    prompt = prompt_file.read_text(encoding="utf-8").format(user_text=user_text, result_text=result_text[:4000])
    model = cfg_get(config, "summary.openai_model", "gpt-4o-mini")
    client = OpenAI()
    try:
        response = client.responses.create(model=model, input=prompt)
        text = getattr(response, "output_text", "")
        return text.strip() or summarize_heuristic(config, result_text)
    except Exception:
        return summarize_heuristic(config, result_text)


def summarize_result(config: Dict[str, Any], user_text: str, result_text: str) -> str:
    if cfg_get(config, "summary.provider", "heuristic") == "openai":
        return summarize_openai(config, user_text, result_text)
    return summarize_heuristic(config, result_text)


def read_state(config: Dict[str, Any], vault_root: Path) -> Dict[str, Any]:
    state_file = resolve_vault_path(vault_root, cfg_get(config, "avatar.state_file", "_ai-assistant/avatar/state.json"))
    if not state_file.exists():
        return {"state": "unknown", "message": ""}
    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception:
        return {"state": "unknown", "message": ""}


def run_text_pipeline(
    config: Dict[str, Any],
    vault_root: Path,
    user_text: str,
    *,
    yes: bool = False,
    dry_run: bool = False,
    no_speak: bool = False,
) -> str:
    risk = classify_risk(user_text)
    if not confirm_if_needed(config, user_text, yes=yes):
        write_state(config, vault_root, "idle", "用户取消了任务")
        return "已取消，没有执行。"

    append_action_log(
        config,
        vault_root,
        {"voice_text": user_text, "risk_level": risk["risk_level"], "needs_write": risk["needs_write"], "event": "start"},
    )

    try:
        write_state(config, vault_root, "thinking", "正在理解命令")
        result = run_codex(config, vault_root, user_text, dry_run=dry_run)
        summary = summarize_result(config, user_text, result)
        append_action_log(
            config,
            vault_root,
            {
                "voice_text": user_text,
                "risk_level": risk["risk_level"],
                "needs_write": risk["needs_write"],
                "event": "done",
                "summary": summary,
            },
        )
        if not no_speak:
            speak(config, vault_root, summary)
        write_state(config, vault_root, "done", summary)
        return result
    except Exception as exc:
        message = f"出错了：{exc}"
        append_action_log(config, vault_root, {"voice_text": user_text, "event": "error", "error": str(exc)})
        write_state(config, vault_root, "error", message[:120])
        if not no_speak:
            speak(config, vault_root, "出错了。我没有完成这次操作，请查看日志。")
        raise


class AssistantServerApp:
    def __init__(self, config: Dict[str, Any], vault_root: Path):
        self.config = config
        self.vault_root = vault_root
        self.recorder = ManualRecorder(config, vault_root)
        self.lock = threading.Lock()

    def health(self) -> Dict[str, Any]:
        return {
            "ok": True,
            "recording": self.recorder.is_recording(),
            "current_note": get_current_note(self.config, self.vault_root),
            "state": read_state(self.config, self.vault_root),
        }

    def start_recording(self) -> Dict[str, Any]:
        return {"ok": True, **self.recorder.start()}

    def stop_recording(self) -> Dict[str, Any]:
        return {"ok": True, **self.recorder.stop()}

    def stop_and_transcribe(self) -> Dict[str, Any]:
        info = self.recorder.stop()
        audio_path = Path(info["output"])
        text = transcribe_audio(self.config, self.vault_root, audio_path)
        transcript_file = resolve_vault_path(self.vault_root, "_ai-assistant/logs/last-transcript.txt")
        transcript_file.parent.mkdir(parents=True, exist_ok=True)
        transcript_file.write_text(text, encoding="utf-8")
        risk = classify_risk(text)
        write_state(self.config, self.vault_root, "confirming", "语音识别完成，等待确认执行")
        return {"ok": True, "transcript": text, "risk": risk, **info}

    def run_text(self, text: str, *, dry_run: bool = False, confirmed: bool = False, no_speak: bool = False) -> Dict[str, Any]:
        text = (text or "").strip()
        if not text:
            return {"ok": False, "status": "empty", "error": "没有可执行的文本。"}

        risk = classify_risk(text)
        if risk["risk_level"] != "low" and not confirmed and not dry_run:
            write_state(self.config, self.vault_root, "confirming", "这个命令可能会修改笔记，等待确认")
            return {
                "ok": True,
                "status": "requires_confirmation",
                "risk": risk,
                "text": text,
                "message": "这个命令可能会修改或批量影响笔记，请确认后再执行。",
            }

        with self.lock:
            result = run_text_pipeline(
                self.config,
                self.vault_root,
                text,
                yes=True,
                dry_run=dry_run,
                no_speak=no_speak,
            )
        state = read_state(self.config, self.vault_root)
        return {"ok": True, "status": "done", "risk": risk, "result": result, "summary": state.get("message", "")}


class AssistantHTTPRequestHandler(BaseHTTPRequestHandler):
    server_version = "ObsidianAIVoiceAssistant/0.2"

    def log_message(self, fmt: str, *args: Any) -> None:
        safe_print(f"[server] {self.address_string()} - {fmt % args}")

    def _send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw.strip() else {}

    @property
    def app(self) -> AssistantServerApp:
        return self.server.assistant_app  # type: ignore[attr-defined]

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        try:
            if self.path.startswith("/health"):
                self._send_json(self.app.health())
                return
            self._send_json({"ok": False, "error": f"unknown path: {self.path}"}, 404)
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc)}, 500)

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        try:
            body = self._read_json()
            if self.path == "/record/start":
                self._send_json(self.app.start_recording())
                return
            if self.path == "/record/stop":
                self._send_json(self.app.stop_recording())
                return
            if self.path == "/record/stop-transcribe":
                self._send_json(self.app.stop_and_transcribe())
                return
            if self.path == "/run-text":
                self._send_json(
                    self.app.run_text(
                        str(body.get("text", "")),
                        dry_run=bool(body.get("dry_run", False)),
                        confirmed=bool(body.get("confirmed", False)),
                        no_speak=bool(body.get("no_speak", False)),
                    )
                )
                return
            if self.path == "/shutdown":
                self._send_json({"ok": True, "status": "shutting_down"})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            self._send_json({"ok": False, "error": f"unknown path: {self.path}"}, 404)
        except Exception as exc:
            write_state(self.app.config, self.app.vault_root, "error", f"server error: {exc}"[:120])
            self._send_json({"ok": False, "error": str(exc)}, 500)


def run_server(config: Dict[str, Any], vault_root: Path, host: Optional[str] = None, port: Optional[int] = None) -> None:
    host = host or str(cfg_get(config, "server.host", "127.0.0.1"))
    port = int(port or cfg_get(config, "server.port", 17345))
    app = AssistantServerApp(config, vault_root)
    httpd = ThreadingHTTPServer((host, port), AssistantHTTPRequestHandler)
    httpd.assistant_app = app  # type: ignore[attr-defined]
    write_state(config, vault_root, "idle", f"常驻语音助手已启动：{host}:{port}")
    safe_print(json.dumps({"ok": True, "server": f"http://{host}:{port}"}, ensure_ascii=False))
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
        write_state(config, vault_root, "idle", "常驻语音助手已停止")


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Obsidian AI 虚拟形象语音助手 MVP")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="配置文件路径")
    sub = parser.add_subparsers(dest="command")

    say = sub.add_parser("say", help="测试 TTS 播报")
    say.add_argument("text")

    rec = sub.add_parser("record", help="录音到 wav 文件")
    rec.add_argument("--seconds", type=int, default=None)
    rec.add_argument("--out", default="")

    tr = sub.add_parser("transcribe", help="转写已有音频")
    tr.add_argument("audio")

    run = sub.add_parser("run-text", help="用文本命令调用 Codex 执行")
    run.add_argument("text")
    run.add_argument("--yes", action="store_true", help="跳过风险确认")
    run.add_argument("--dry-run", action="store_true", help="只打印将发送给 Codex 的 prompt")
    run.add_argument("--no-speak", action="store_true", help="不播报结果")

    voice = sub.add_parser("voice", help="完整流程：录音 → STT → Codex → TTS")
    voice.add_argument("--seconds", type=int, default=None)
    voice.add_argument("--yes", action="store_true", help="跳过风险确认")
    voice.add_argument("--dry-run", action="store_true", help="只打印将发送给 Codex 的 prompt")
    voice.add_argument("--no-speak", action="store_true", help="不播报结果")

    note = sub.add_parser("current-note", help="显示或设置当前笔记路径")
    note.add_argument("path", nargs="?")

    status = sub.add_parser("status", help="手动更新 avatar state")
    status.add_argument("state")
    status.add_argument("message", nargs="?", default="")

    server = sub.add_parser("server", help="启动常驻 HTTP server，供 Obsidian 插件控制录音")
    server.add_argument("--host", default=None)
    server.add_argument("--port", type=int, default=None)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0

    config = load_config(Path(args.config))
    vault_root = resolve_vault_root(config)

    if args.command == "say":
        speak(config, vault_root, args.text)
        write_state(config, vault_root, "idle", "待机中")
        return 0

    if args.command == "record":
        out = resolve_vault_path(vault_root, args.out) if args.out else None
        record_audio(config, vault_root, args.seconds, out)
        write_state(config, vault_root, "idle", "待机中")
        return 0

    if args.command == "transcribe":
        audio_path = resolve_vault_path(vault_root, args.audio)
        text = transcribe_audio(config, vault_root, audio_path)
        safe_print(text)
        write_state(config, vault_root, "idle", "待机中")
        return 0

    if args.command == "run-text":
        result = run_text_pipeline(
            config,
            vault_root,
            args.text,
            yes=args.yes,
            dry_run=args.dry_run,
            no_speak=args.no_speak,
        )
        safe_print("\n--- Codex Result ---\n" + result)
        return 0

    if args.command == "voice":
        try:
            audio_path = record_audio(config, vault_root, args.seconds, None)
            text = transcribe_audio(config, vault_root, audio_path)
        except SystemExit:
            # 例如 OPENAI_API_KEY 未设置这类清晰的配置错误。
            write_state(config, vault_root, "error", "语音识别配置错误，未完成集成流程")
            raise
        except Exception as exc:
            write_state(config, vault_root, "error", f"语音识别失败：{exc}"[:120])
            raise
        safe_print(f"识别结果：{text}")
        if not text:
            speak(config, vault_root, "我没有听清楚，请再说一次。")
            write_state(config, vault_root, "idle", "待机中")
            return 1
        result = run_text_pipeline(
            config,
            vault_root,
            text,
            yes=args.yes,
            dry_run=args.dry_run,
            no_speak=args.no_speak,
        )
        safe_print("\n--- Codex Result ---\n" + result)
        return 0

    if args.command == "current-note":
        if args.path:
            path = set_current_note(config, vault_root, args.path)
            safe_print(f"当前笔记已更新：{path}")
        else:
            safe_print(get_current_note(config, vault_root) or "未设置")
        return 0

    if args.command == "status":
        write_state(config, vault_root, args.state, args.message)
        return 0

    if args.command == "server":
        run_server(config, vault_root, host=args.host, port=args.port)
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
