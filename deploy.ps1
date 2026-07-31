# Script de Deploy Automático para PowerShell

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "         FAZENDO DEPLOY AUTOMÁTICO (FINANÇAS)          " -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Adicionando arquivos alterados..." -ForegroundColor Yellow
git add .

Write-Host "2. Criando commit..." -ForegroundColor Yellow
$msg = Read-Host "Digite a mensagem do commit (ou pressione Enter para mensagem padrão)"
if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "Deploy automatico: atualizacoes do sistema financeiro"
}

git commit -m "$msg"

Write-Host ""
Write-Host "3. Enviando alterações para o GitHub (push)..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " DEPLOY CONCLUÍDO COM SUCESSO!                          " -ForegroundColor Green
Write-Host " O Render atualizará o seu site online em 1 a 2 minutos." -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
