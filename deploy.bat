@echo off
chcp 65001 > nul
echo.
echo =======================================================
echo     FAZENDO DEPLOY AUTOMÁTICO COM BACKUP DO SUPABASE
echo =======================================================
echo.
echo 1. Realizando backup completo do Supabase PostgreSQL...
python backup_supabase_to_sqlite.py
if %errorlevel% neq 0 (
    echo.
    echo [ERRO CRÍTICO] O backup do Supabase falhou! O deploy foi abortado por segurança.
    pause
    exit /b %errorlevel%
)

echo.
echo 2. Adicionando arquivos alterados e o novo backup...
git add .

echo.
echo 3. Criando commit...
set /p msg="Digite a mensagem do commit (ou dê Enter para mensagem padrão): "
if "%msg%"=="" set msg=Deploy automatico com backup completo do Supabase

git commit -m "%msg%"

echo.
echo 4. Enviando alterações para o GitHub (push)...
git push origin main

echo.
echo =======================================================
echo  BACKUP E DEPLOY CONCLUÍDOS COM SUCESSO!
echo  O Render atualizará o seu site online em 1 a 2 minutos.
echo =======================================================
echo.
pause
