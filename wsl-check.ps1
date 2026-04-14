$result = wsl -d Ubuntu -u root -- bash -c "echo hello_$(Get-Date -Format 'HHmmss')"
$result | Out-File -Encoding UTF8 "C:\recycle\wsl-check-out.txt"
"exit_code=$LASTEXITCODE" | Out-File -Append -Encoding UTF8 "C:\recycle\wsl-check-out.txt"
