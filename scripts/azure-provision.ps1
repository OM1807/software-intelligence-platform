<#
.SYNOPSIS
    Automated Azure Provisioning Script for Software Intelligence Platform (SIP).
.DESCRIPTION
    Creates:
    1. Azure Resource Group
    2. Azure Database for PostgreSQL (Flexible Server)
    3. Azure Container Registry (ACR)
    4. Azure Container Apps Environment & Backend Container App
    5. Azure Static Web Apps (Frontend)
    Outputs all required GitHub Secrets for automated CI/CD.
#>

param(
    [string]$ResourceGroup = "rg-sip-prod",
    [string]$Location = "eastus",
    [string]$DbUser = "sip_user",
    [string]$DbPassword = "",
    [string]$SecretKey = "",
    [string]$GeminiApiKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " SIP — Azure Infrastructure Provisioning Script" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Azure CLI is installed
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI ('az') is not installed. Install via: winget install Microsoft.AzureCLI"
    exit 1
}

# 2. Check Azure Login
Write-Host "[1/6] Verifying Azure Authentication..." -ForegroundColor Yellow
$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please log in to your Azure account..." -ForegroundColor Yellow
    az login --output none
    $account = az account show --output json | ConvertFrom-Json
}
Write-Host "Active Subscription: $($account.name) ($($account.id))" -ForegroundColor Green

# Generate unique names
$suffix = -join ((97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
$AcrName = "acrsip$suffix"
$DbServerName = "psql-sip-$suffix"
$ContainerEnvName = "env-sip-$suffix"
$BackendAppName = "app-sip-backend"
$FrontendAppName = "swa-sip-frontend"

if ([string]::IsNullOrWhiteSpace($DbPassword)) {
    $DbPassword = "Sip" + [Guid]::NewGuid().ToString("N").Substring(0, 12) + "!"
}
if ([string]::IsNullOrWhiteSpace($SecretKey)) {
    $SecretKey = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
}

# 3. Create Resource Group
Write-Host "[2/6] Creating Resource Group '$ResourceGroup' in '$Location'..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none

# 4. Create Azure Container Registry
Write-Host "[3/6] Creating Azure Container Registry '$AcrName' (Basic)..." -ForegroundColor Yellow
az acr create --resource-group $ResourceGroup --name $AcrName --sku Basic --admin-enabled true --output none
$acrCreds = az acr credential show --name $AcrName --output json | ConvertFrom-Json
$acrLoginServer = "$AcrName.azurecr.io"
$acrUsername = $acrCreds.username
$acrPassword = $acrCreds.passwords[0].value

# 5. Create Azure Database for PostgreSQL Flexible Server
Write-Host "[4/6] Creating Azure PostgreSQL Flexible Server '$DbServerName' (B1ms Burstable)..." -ForegroundColor Yellow
az postgres flexible-server create `
    --resource-group $ResourceGroup `
    --name $DbServerName `
    --location $Location `
    --admin-user $DbUser `
    --admin-password $DbPassword `
    --sku-name Standard_B1ms `
    --tier Burstable `
    --storage-size 32 `
    --version 15 `
    --yes `
    --output none

# Allow Azure Services firewall rule
az postgres flexible-server firewall-rule create `
    --resource-group $ResourceGroup `
    --name $DbServerName `
    --rule-name AllowAllAzureServicesAndIPs `
    --start-ip-address 0.0.0.0 `
    --end-ip-address 0.0.0.0 `
    --output none

# Create sip_database
az postgres flexible-server db create `
    --resource-group $ResourceGroup `
    --server-name $DbServerName `
    --database-name sip_database `
    --output none

$dbHost = "$DbServerName.postgres.database.azure.com"
$databaseUrl = "postgresql://$($DbUser):$($DbPassword)@$($dbHost):5432/sip_database?sslmode=require"

# 6. Create Azure Container Apps Environment & App
Write-Host "[5/6] Creating Azure Container Apps Environment & Backend Container App..." -ForegroundColor Yellow
az containerapp env create `
    --name $ContainerEnvName `
    --resource-group $ResourceGroup `
    --location $Location `
    --output none

az containerapp create `
    --name $BackendAppName `
    --resource-group $ResourceGroup `
    --environment $ContainerEnvName `
    --image "mcr.microsoft.com/azuredocs/aci-helloworld:latest" `
    --target-port 8000 `
    --ingress external `
    --min-replicas 1 `
    --max-replicas 3 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --env-vars "ENVIRONMENT=production" "DATABASE_URL=$databaseUrl" "SECRET_KEY=$SecretKey" "LLM_API_KEY=$GeminiApiKey" `
    --output none

$backendUrl = az containerapp show --name $BackendAppName --resource-group $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv
$backendUrlFull = "https://$backendUrl"

# 7. Create Azure Static Web App
Write-Host "[6/6] Creating Azure Static Web App '$FrontendAppName'..." -ForegroundColor Yellow
$swa = az staticwebapp create `
    --name $FrontendAppName `
    --resource-group $ResourceGroup `
    --location $Location `
    --sku Free `
    --output json | ConvertFrom-Json

$swaApiKey = az staticwebapp secrets list --name $FrontendAppName --resource-group $ResourceGroup --query "properties.apiKey" -o tsv
$frontendUrl = "https://$($swa.defaultHostname)"

# Update Backend with allowed frontend CORS URL
az containerapp update `
    --name $BackendAppName `
    --resource-group $ResourceGroup `
    --set-env-vars "FRONTEND_URL=$frontendUrl" "BACKEND_URL=$backendUrlFull" `
    --output none

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Provisioning Complete!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Backend API URL:       $backendUrlFull"
Write-Host "Frontend App URL:      $frontendUrl"
Write-Host "PostgreSQL Server:     $dbHost"
Write-Host "ACR Registry:          $acrLoginServer"
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " Add these Secrets to your GitHub Repository:" -ForegroundColor Cyan
Write-Host " (Settings -> Secrets and variables -> Actions)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "ACR_LOGIN_SERVER:                 $acrLoginServer"
Write-Host "ACR_USERNAME:                     $acrUsername"
Write-Host "ACR_PASSWORD:                     $acrPassword"
Write-Host "AZURE_RESOURCE_GROUP:             $ResourceGroup"
Write-Host "AZURE_CONTAINER_APP_NAME:         $BackendAppName"
Write-Host "VITE_BACKEND_URL:                 $backendUrlFull"
Write-Host "AZURE_STATIC_WEB_APPS_API_TOKEN:  $swaApiKey"
Write-Host "==========================================================" -ForegroundColor Cyan
