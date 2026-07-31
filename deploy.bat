@echo off
cls
echo =======================================================
echo     FAZENDO DEPLOY AUTOMATICO COM BACKUP DO SUPABASE
echo =======================================================
echo.
echo 1. Realizando backup completo do Supabase PostgreSQL...
python backup_supabase_to_sqlite.py
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRITICO] O backup do Supabase falhou! Deploy cancelado.
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Adicionando arquivos alterados...
git add .

echo.
echo 3. Criando commit...
set /p msg="Digite a mensagem do commit (ou pressione Enter para padrao): "
if "%msg%"=="" set msg=Deploy automatico com backup do Supabase

git commit -m "%msg%"

echo.
echo 4. Enviando alteracoes para o GitHub (push)...
git push origin main

echo.
echo =======================================================
echo  BACKUP E DEPLOY CONCLUIDOS COM SUCESSO!
echo  O Render atualizara o seu site online em 1 a 2 minutos.
echo =======================================================
echo.
pause
