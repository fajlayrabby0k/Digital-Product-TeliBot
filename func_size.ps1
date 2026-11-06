$lines = Get-Content "C:\Users\Fojlay Rabby\.gemini\antigravity\scratch\telegram-shop-pages\_worker.js"
$func = "TOP"
$counts = @{}
foreach ($line in $lines) {
    if ($line -match "^(?:async )?function ([a-zA-Z0-9_]+)") {
        $func = $matches[1]
    }
    if (-not $counts.ContainsKey($func)) { $counts[$func] = 0 }
    $counts[$func]++
}
$counts.GetEnumerator() | Sort-Object Value -Descending | Format-Table -AutoSize
