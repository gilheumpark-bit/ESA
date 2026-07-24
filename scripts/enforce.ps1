$ErrorActionPreference = 'Stop'

$steps = @(
  @{ Name = 'Documentation contracts'; Command = 'npm'; Arguments = @('run', 'check:docs') },
  @{ Name = 'TypeScript'; Command = 'npx'; Arguments = @('tsc', '--noEmit') },
  @{ Name = 'ESLint'; Command = 'npm'; Arguments = @('run', 'lint', '--', '--max-warnings=0') },
  @{ Name = 'Jest'; Command = 'npm'; Arguments = @('test', '--', '--runInBand') },
  @{ Name = 'Next.js build'; Command = 'npm'; Arguments = @('run', 'build') },
  @{ Name = 'PDF fixture gate'; Command = 'npm'; Arguments = @('run', 'gate:pdf') }
)

foreach ($step in $steps) {
  Write-Host "[enforce] $($step.Name)"
  $command = $step.Command
  $arguments = $step.Arguments
  & $command @arguments
  if ($LASTEXITCODE -ne 0) {
    Write-Error "[enforce] $($step.Name) failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
}

Write-Host '[enforce] PASS'
exit 0
