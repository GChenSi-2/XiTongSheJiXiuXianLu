@echo off
setlocal
cd /d "%~dp0.."
python -m pip install -r _ai-assistant\requirements.txt
echo.
echo Base dependencies installed.
echo If you want local faster-whisper later, run:
echo python -m pip install -r _ai-assistant\requirements-whisper.txt

