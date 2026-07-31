@echo off
chcp 65001 > nul
echo.
echo =======================================================
echo          FAZENDO DEPLOY AUTOMÁTICO (FINANÇAS)
echo =======================================================
echo.
echo 1. Adicionando arquivos alterados...
git add .

echo 2. Criando commit...
set /p msg="Digite a mensagem do commit (ou dê Enter para mensagem padrão): "
if "%msg%"=="" set msg=Deploy automatico: atualizacoes do sistema financeiro

git commit -m "%msg%"

echo.
echo 3. Enviando alterações para o GitHub (push)...
git push origin main

echo.
echo =======================================================
echo  DEPLOY CONCLUÍDO COM SUCESSO!
echo  O Render atualizará o seu site online em 1 a 2 minutos.
echo =======================================================
echo.
pause
