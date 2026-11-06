$content = Get-Content "C:\Users\Fojlay Rabby\.gemini\antigravity\scratch\telegram-shop-pages\_worker.js" -Raw
$openB = [regex]::Matches($content, '\{').Count
$closeB = [regex]::Matches($content, '\}').Count
$openP = [regex]::Matches($content, '\(').Count
$closeP = [regex]::Matches($content, '\)').Count
$openK = [regex]::Matches($content, '\[').Count
$closeK = [regex]::Matches($content, '\]').Count
Write-Host "Braces: $openB / $closeB"
Write-Host "Parens: $openP / $closeP"
Write-Host "Brackets: $openK / $closeK"
