$lines = Get-Content "C:\Users\Fojlay Rabby\.gemini\antigravity\scratch\telegram-shop-pages\_worker.js"
for ($i = 360; $i -lt 1830; $i++) {
    $line = $lines[$i]
    if ($line -match "if \(data ===|if \(data\.startsWith") {
        Write-Host "$($i+1): $line"
    }
}
