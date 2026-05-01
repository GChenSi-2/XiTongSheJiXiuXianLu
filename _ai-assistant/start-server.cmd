@echo off
setlocal
cd /d "%~dp0.."
python _ai-assistant\assistant.py server %*
