$ErrorActionPreference = "Stop"

function Invoke-Checked {
    & $args[0] @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $($args -join ' ')"
    }
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $Root
$Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$BuildTools = Join-Path $Sdk "build-tools\30.0.3"
$D8Jar = Join-Path $Sdk "cmdline-tools\latest\lib\d8-classpath.jar"
if (!(Test-Path $D8Jar)) {
    $D8Jar = Join-Path $BuildTools "lib\d8.jar"
}
$PlatformJar = Join-Path $Sdk "platforms\android-30\android.jar"
$App = Join-Path $Root "app"
$Build = Join-Path $Root "build"
$Gen = Join-Path $Build "gen"
$Classes = Join-Path $Build "classes"
$Dex = Join-Path $Build "dex"
$Unsigned = Join-Path $Build "SNSGod-unsigned.apk"
$Aligned = Join-Path $Build "SNSGod-aligned.apk"
$Signed = Join-Path $Build "SNSGod-debug.apk"
$KeyStore = Join-Path $Build "debug.keystore"

New-Item -ItemType Directory -Force -Path $Build, $Gen, $Classes, $Dex | Out-Null
Copy-Item -LiteralPath (Join-Path $ProjectRoot "SNSGod.js") -Destination (Join-Path $App "src\main\assets\www\SNSGod.js") -Force
$BootstrapBackupSource = Join-Path $ProjectRoot "backup\messengergod-backup.json"
$BootstrapBackupAsset = Join-Path $App "src\main\assets\www\bootstrap-backup.json"
$BootstrapBackupScript = Join-Path $App "src\main\assets\www\bootstrap-backup.js"
if (Test-Path $BootstrapBackupSource) {
    Copy-Item -LiteralPath $BootstrapBackupSource -Destination $BootstrapBackupAsset -Force
    $BootstrapBackupRaw = [System.IO.File]::ReadAllText($BootstrapBackupSource, [System.Text.Encoding]::UTF8)
    $BootstrapBackupLiteral = $BootstrapBackupRaw | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($BootstrapBackupScript, "window.__SNSGOD_BOOTSTRAP_BACKUP_TEXT = $BootstrapBackupLiteral;", [System.Text.Encoding]::UTF8)
} elseif (Test-Path $BootstrapBackupAsset) {
    Remove-Item -LiteralPath $BootstrapBackupAsset -Force
    if (Test-Path $BootstrapBackupScript) {
        Remove-Item -LiteralPath $BootstrapBackupScript -Force
    }
}

Invoke-Checked (Join-Path $BuildTools "aapt2.exe") compile --dir (Join-Path $App "src\main\res") -o (Join-Path $Build "res.zip")
Invoke-Checked (Join-Path $BuildTools "aapt2.exe") link -o $Unsigned -I $PlatformJar --manifest (Join-Path $App "src\main\AndroidManifest.xml") --java $Gen (Join-Path $Build "res.zip") --auto-add-overlay

$JavaFiles = Get-ChildItem -Path (Join-Path $App "src\main\java") -Filter *.java -Recurse | ForEach-Object { $_.FullName }
$GeneratedJavaFiles = Get-ChildItem -Path $Gen -Filter *.java -Recurse | ForEach-Object { $_.FullName }
$AllJavaFiles = @($JavaFiles) + @($GeneratedJavaFiles)
Invoke-Checked "javac" -encoding UTF-8 -source 8 -target 8 -bootclasspath $PlatformJar -d $Classes @AllJavaFiles

Get-ChildItem -Path $Dex -Filter *.dex -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force
$ClassFiles = Get-ChildItem -Path $Classes -Filter *.class -Recurse | ForEach-Object { $_.FullName }
Invoke-Checked "java" -cp $D8Jar com.android.tools.r8.D8 --lib $PlatformJar --output $Dex @ClassFiles
Push-Location $Dex
try {
    Invoke-Checked (Join-Path $BuildTools "aapt.exe") add $Unsigned "classes.dex"
}
finally {
    Pop-Location
}

Push-Location (Join-Path $App "src\main")
try {
    $AssetFiles = @("assets/www/index.html", "assets/www/risu-shim.js", "assets/www/standalone-mobile.css", "assets/www/SNSGod.js")
    if (Test-Path "assets/www/bootstrap-backup.js") {
        $AssetFiles += "assets/www/bootstrap-backup.js"
    }
    if (Test-Path "assets/www/bootstrap-backup.json") {
        $AssetFiles += "assets/www/bootstrap-backup.json"
    }
    Invoke-Checked (Join-Path $BuildTools "aapt.exe") add $Unsigned @AssetFiles
}
finally {
    Pop-Location
}

if (Test-Path $Aligned) { Remove-Item -LiteralPath $Aligned -Force }
if (Test-Path $Signed) { Remove-Item -LiteralPath $Signed -Force }
Invoke-Checked (Join-Path $BuildTools "zipalign.exe") -f 4 $Unsigned $Aligned

if (!(Test-Path $KeyStore)) {
    Invoke-Checked "keytool" -genkeypair -v -keystore $KeyStore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=SNSGod Debug,O=SNSGod,C=KR"
}

Invoke-Checked (Join-Path $BuildTools "apksigner.bat") sign --ks $KeyStore --ks-pass pass:android --key-pass pass:android --out $Signed $Aligned
Invoke-Checked (Join-Path $BuildTools "apksigner.bat") verify $Signed

Write-Host "Built $Signed"
