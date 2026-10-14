# Deletes the leftover Avast sandbox snapshots (C:\avast! sandbox) and reports freed space.
# Run elevated. Log goes to D:\avast-sandbox-cleanup.log
$log = 'D:\avast-sandbox-cleanup.log'
$target = 'C:\avast! sandbox'
$before = (Get-Volume -DriveLetter C).SizeRemaining
"[$(Get-Date)] start, free before: $([math]::Round($before/1GB,1)) GB" | Out-File $log -Encoding utf8

if (Test-Path -LiteralPath $target) {
    # Take ownership and grant full control first; some files are owned by SYSTEM/Avast.
    & takeown.exe /F "$target" /R /D Y /A | Out-Null
    & icacls.exe "$target" /grant "*S-1-5-32-544:(OI)(CI)F" /T /C /Q | Out-Null
    try {
        Remove-Item -LiteralPath $target -Recurse -Force -Confirm:$false -ErrorAction Stop
        "removed $target" | Out-File $log -Append
    } catch {
        "remove failed: $($_.Exception.Message)" | Out-File $log -Append
        # Second pass: delete whatever can be deleted, file by file.
        Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            ForEach-Object { try { Remove-Item -LiteralPath $_.FullName -Force -Recurse -Confirm:$false -ErrorAction Stop } catch {} }
        Remove-Item -LiteralPath $target -Force -Recurse -Confirm:$false -ErrorAction SilentlyContinue
    }
}
$after = (Get-Volume -DriveLetter C).SizeRemaining
"[$(Get-Date)] done, free after: $([math]::Round($after/1GB,1)) GB, freed: $([math]::Round(($after-$before)/1GB,1)) GB, still exists: $(Test-Path -LiteralPath $target)" | Out-File $log -Append
