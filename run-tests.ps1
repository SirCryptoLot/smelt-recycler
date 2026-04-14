$ErrorActionPreference = "Continue"
$ENV_PATH = "/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/usr/local/bin:/bin"

Write-Host "=== Starting local validator ==="
$validatorJob = Start-Job -ScriptBlock {
    wsl -d Ubuntu -u root -- bash -c "export PATH='/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/bin' && solana-test-validator --reset 2>&1"
}

Write-Host "Waiting 10s for validator to boot..."
Start-Sleep -Seconds 10

Write-Host "=== Deploying program ==="
$deployOut = wsl -d Ubuntu -u root -- bash -c "export PATH='/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/bin' && cd /mnt/c/recycle && anchor deploy --provider.cluster localnet 2>&1"
Write-Host $deployOut

Write-Host "=== Uploading IDL ==="
$idlOut = wsl -d Ubuntu -u root -- bash -c "export PATH='/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/bin' && anchor idl init --filepath /mnt/c/recycle/target/idl/smelt_staking.json CiMhekpwAzLAfRr8um6Hexpnf8L8iTXkGZxJKin9e9Mk --provider.cluster localnet 2>&1"
Write-Host $idlOut

Write-Host "=== Running tests ==="
$testOut = wsl -d Ubuntu -u root -- bash -c "export PATH='/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:/usr/bin:/bin' && cd /mnt/c/recycle && anchor test --skip-local-validator 2>&1"
Write-Host $testOut

$testOut | Out-File -Encoding UTF8 "C:\recycle\test-results.txt"
Write-Host "Results saved to C:\recycle\test-results.txt"
