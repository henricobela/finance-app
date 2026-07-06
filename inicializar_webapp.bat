@echo off
title Inicializar Organizacao Financeira

:: Configura o diretório de trabalho para a pasta do projeto
cd /d "c:\Users\Henrico\OneDrive\Desktop\Projetos\Organizacao Financeira"

echo [1/3] Ativando ambiente virtual (se existir)...
:: Ativa o ambiente virtual venv ou .venv se algum deles estiver presente
if exist "venv\Scripts\activate.bat" (
    call "venv\Scripts\activate.bat"
) else if exist ".venv\Scripts\activate.bat" (
    call ".venv\Scripts\activate.bat"
)

echo [2/3] Iniciando o servidor Flask em segundo plano...
:: Abre o servidor python em uma janela minimizada para nao atrapalhar
start /min "Servidor Organizacao Financeira" python app.py

echo [3/3] Aguardando o servidor iniciar...
:: Aguarda 3 segundos para garantir que o Flask iniciou antes de abrir o navegador
timeout /t 3 /nobreak > nul

echo Abrindo o Opera com a aplicacao ativa...
:: Tenta localizar o executavel do Opera
set "OPERA_PATH="

if exist "%LOCALAPPDATA%\Programs\Opera\launcher.exe" (
    set "OPERA_PATH=%LOCALAPPDATA%\Programs\Opera\launcher.exe"
) else if exist "%PROGRAMFILES%\Opera\launcher.exe" (
    set "OPERA_PATH=%PROGRAMFILES%\Opera\launcher.exe"
) else if exist "%PROGRAMFILES(x86)%\Opera\launcher.exe" (
    set "OPERA_PATH=%PROGRAMFILES(x86)%\Opera\launcher.exe"
)

:: Executa o Opera com a URL do projeto. Se nao achar o Opera, usa o comando generico ou o navegador padrao.
if defined OPERA_PATH (
    start "" "%OPERA_PATH%" "http://localhost:5000"
) else (
    start "" "opera" "http://localhost:5000" || start http://localhost:5000
)

echo Concluido!
exit
