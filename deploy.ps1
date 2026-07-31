# Script de Deploy Automático com Backup Prévio do Supabase para PowerShell

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "    FAZENDO DEPLOY AUTOMÁTICO COM BACKUP DO SUPABASE    " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Realizando backup completo do Supabase PostgreSQL..." -ForegroundColor Yellow
python backup_supabase_to_sqlite.py

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERRO CRÍTICO] O backup do Supabase falhou! O deploy foi abortado por segurança." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "2. Adicionando arquivos alterados..." -ForegroundColor Yellow
git add .

Write-Host ""
Write-Host "3. Criando commit..." -ForegroundColor Yellow
$msg = Read-Host "Digite a mensagem do commit (ou pressione Enter para mensagem padrão)"
if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "Deploy automatico com backup completo do Supabase"
}

git commit -m "$msg"

Write-Host ""
Write-Host "4. Enviando alterações para o GitHub (push)..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " BACKUP E DEPLOY CONCLUÍDOS COM SUCESSO!               " -ForegroundColor Green
Write-Host " O Render atualizará o seu site online em 1 a 2 minutos." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
