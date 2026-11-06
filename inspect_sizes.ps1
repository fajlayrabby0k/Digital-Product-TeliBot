$lines = Get-Content "C:\Users\Fojlay Rabby\.gemini\antigravity\scratch\telegram-shop-pages\worker_compact.js"
$top = @{}
$cur = "TOP"
foreach ($line in $lines) {
    if ($line -match "^(?:async )?function ([a-zA-Z0-9_]+)") { $cur = $matches[1] }
    if (-not $top.ContainsKey($cur)) { $top[$cur] = 0 }
    $top[$cur] += $line.Length + 2
}
$top.GetEnumerator() | Sort-Object Value -Descending | Format-Table -AutoSize
