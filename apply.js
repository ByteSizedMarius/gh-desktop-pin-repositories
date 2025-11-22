#!/usr/bin/env node

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const DESKTOP_REPO = 'https://github.com/desktop/desktop.git'
const DESKTOP_TAG = 'release-3.5.2'

const PATCHES_DIR = path.join(__dirname, 'patches')

// Feature patches that may have overlapping changes - will use three-way merge
const FEATURE_PATCHES = [
  {
    name: 'pins',
    file: 'pins.patch',
    description: 'Pin repositories to the top of the list',
    recommended: true,
  },
  {
    name: 'remove-recent',
    file: 'remove-recent.patch',
    description: 'Remove the "Recent" repositories section',
    recommended: false,
  },
]

// Standalone patches that don't overlap with features
const STANDALONE_PATCHES = [
  {
    name: 'disable-auto-updates',
    file: 'disable_auto_updates.patch',
    description: 'Prevent app from auto-updating (keeps your patches)',
    recommended: true,
  },
  {
    name: 'fix-auth-handler',
    file: 'fix_auth_handler.patch',
    description: 'Fix OAuth for custom builds',
    recommended: true,
  },
  {
    name: 'separate-instance',
    file: 'separate_instance.patch',
    description: 'Run alongside official GitHub Desktop (for multiple accounts)',
    recommended: false,
  },
]

const ALL_PATCHES = [...FEATURE_PATCHES, ...STANDALONE_PATCHES]

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

function log(msg, color = '') {
  console.log(color ? `${color}${msg}${colors.reset}` : msg)
}

function logStep(step, total, msg) {
  log(`\n[${step}/${total}] ${msg}`, colors.cyan)
}

function logSuccess(msg) {
  log(`  ✓ ${msg}`, colors.green)
}

function logError(msg) {
  log(`  ✗ ${msg}`, colors.red)
}

function logWarn(msg) {
  log(`  ! ${msg}`, colors.yellow)
}

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...options }).trim()
  } catch (e) {
    return null
  }
}

function commandExists(cmd) {
  const check = process.platform === 'win32' ? 'where' : 'which'
  return exec(`${check} ${cmd}`) !== null
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function promptYesNo(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]'
  const answer = await prompt(`${question} ${hint}: `)
  if (answer === '') return defaultYes
  return answer.toLowerCase().startsWith('y')
}

async function promptSelect(items, message) {
  console.log(`\n${message}`)
  const selected = new Set()

  // Pre-select recommended items
  items.forEach((item, i) => {
    if (item.recommended) selected.add(i)
  })

  // Simple selection - show list, let user toggle by number
  const showList = () => {
    items.forEach((item, i) => {
      const check = selected.has(i) ? '[x]' : '[ ]'
      const rec = item.recommended ? ' (recommended)' : ''
      console.log(`  ${i + 1}. ${check} ${item.name}${rec}`)
      console.log(`      ${colors.dim}${item.description}${colors.reset}`)
    })
    console.log(`\n  Enter numbers to toggle, 'a' for all, 'n' for none, or press Enter to confirm`)
  }

  showList()

  while (true) {
    const input = await prompt('> ')

    if (input === '') {
      break
    } else if (input.toLowerCase() === 'a') {
      items.forEach((_, i) => selected.add(i))
    } else if (input.toLowerCase() === 'n') {
      selected.clear()
    } else {
      const nums = input.split(/[\s,]+/).map(n => parseInt(n) - 1).filter(n => n >= 0 && n < items.length)
      nums.forEach(n => {
        if (selected.has(n)) selected.delete(n)
        else selected.add(n)
      })
    }

    console.log('\x1B[2J\x1B[0f') // Clear screen
    console.log(message)
    showList()
  }

  return items.filter((_, i) => selected.has(i))
}

function checkPrerequisites() {
  const checks = [
    { name: 'Node.js', cmd: 'node', version: () => exec('node --version') },
    { name: 'Git', cmd: 'git', version: () => exec('git --version')?.split(' ')[2] },
    { name: 'Yarn', cmd: 'yarn', version: () => exec('yarn --version') },
    { name: 'Python', cmd: 'python', version: () => exec('python --version')?.split(' ')[1] || exec('python3 --version')?.split(' ')[1], optional: true },
  ]

  let allPassed = true
  const warnings = []

  for (const check of checks) {
    const exists = commandExists(check.cmd) || (check.cmd === 'python' && commandExists('python3'))
    const version = exists ? check.version() : null

    if (exists && version) {
      logSuccess(`${check.name} ${version}`)
    } else if (check.optional) {
      logWarn(`${check.name} not found (may be needed for native modules)`)
      warnings.push(check.name)
    } else {
      logError(`${check.name} not found`)
      allPassed = false
    }
  }

  // Platform-specific checks
  if (process.platform === 'win32') {
    // Check for VS Build Tools (approximate check)
    const hasVS = fs.existsSync('C:\\Program Files (x86)\\Microsoft Visual Studio') ||
                  fs.existsSync('C:\\Program Files\\Microsoft Visual Studio')
    if (!hasVS) {
      logWarn('Visual Studio / Build Tools may be required for native modules')
      warnings.push('VS Build Tools')
    } else {
      logSuccess('Visual Studio / Build Tools detected')
    }
  } else if (process.platform === 'darwin') {
    const hasXcode = commandExists('xcodebuild')
    if (!hasXcode) {
      logWarn('Xcode Command Line Tools may be required')
      warnings.push('Xcode')
    } else {
      logSuccess('Xcode detected')
    }
  }

  return { passed: allPassed, warnings }
}

async function setupRepository(targetPath) {
  if (fs.existsSync(targetPath) && fs.existsSync(path.join(targetPath, '.git'))) {
    // Check if it's the right repo and version
    const remoteUrl = exec('git remote get-url origin', { cwd: targetPath })
    if (remoteUrl && remoteUrl.includes('desktop/desktop')) {
      logSuccess(`Found existing desktop repository at ${targetPath}`)

      // Check for uncommitted changes
      const status = exec('git status --porcelain', { cwd: targetPath })
      if (status) {
        logWarn('Repository has uncommitted changes')
        const proceed = await promptYesNo('Reset to clean state? (WARNING: discards all changes)', false)
        if (proceed) {
          exec('git reset --hard', { cwd: targetPath })
          exec('git clean -fd', { cwd: targetPath })
          logSuccess('Repository reset to clean state')
        } else {
          logError('Cannot apply patches to dirty repository')
          return false
        }
      }

      // Checkout the right tag
      const currentTag = exec('git describe --tags --exact-match 2>/dev/null', { cwd: targetPath })
      if (currentTag !== DESKTOP_TAG) {
        log(`  Checking out ${DESKTOP_TAG}...`)
        const result = exec(`git fetch --tags && git checkout ${DESKTOP_TAG}`, { cwd: targetPath })
        if (result === null) {
          logError(`Failed to checkout ${DESKTOP_TAG}`)
          return false
        }
        logSuccess(`Checked out ${DESKTOP_TAG}`)
      } else {
        logSuccess(`Already on ${DESKTOP_TAG}`)
      }

      return true
    }
  }

  // Need to clone
  log(`  Cloning desktop/desktop (this may take a few minutes)...`)
  const cloneCmd = `git clone --depth 1 --branch ${DESKTOP_TAG} ${DESKTOP_REPO} "${targetPath}"`

  try {
    execSync(cloneCmd, { stdio: 'inherit' })
    logSuccess('Repository cloned successfully')
    return true
  } catch (e) {
    logError('Failed to clone repository')
    return false
  }
}

function applyPatch(patchPath, targetDir) {
  const patchName = path.basename(patchPath)
  try {
    // Try to apply with git apply
    execSync(`git apply --check "${patchPath}"`, { cwd: targetDir, stdio: 'pipe' })
    execSync(`git apply "${patchPath}"`, { cwd: targetDir, stdio: 'pipe' })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function threeWayMerge(patches, targetDir) {
  // For each file that's modified by multiple patches, we need to:
  // 1. Get the original file content
  // 2. Apply each patch independently to get different versions
  // 3. Use diff3 or similar to merge them

  // First, collect all files modified by the selected patches
  const filePatches = new Map() // file -> [patch contents that modify it]

  for (const patch of patches) {
    const patchPath = path.join(PATCHES_DIR, patch.file)
    const patchContent = fs.readFileSync(patchPath, 'utf8')

    // Parse patch to find affected files
    const fileRegex = /^diff --git a\/(.+?) b\/\1/gm
    let match
    while ((match = fileRegex.exec(patchContent)) !== null) {
      const file = match[1]
      if (!filePatches.has(file)) {
        filePatches.set(file, [])
      }
      filePatches.get(file).push({ patch, patchContent, patchPath })
    }
  }

  // Check for files modified by multiple patches
  const conflicts = []
  for (const [file, patchList] of filePatches) {
    if (patchList.length > 1) {
      conflicts.push({ file, patches: patchList.map(p => p.patch.name) })
    }
  }

  if (conflicts.length === 0) {
    // No overlapping files - can apply sequentially
    return { needsMerge: false, conflicts: [] }
  }

  // We have overlapping patches - need three-way merge
  return { needsMerge: true, conflicts, filePatches }
}

async function applyPatches(selectedPatches, targetDir) {
  const featurePatches = selectedPatches.filter(p => FEATURE_PATCHES.some(f => f.name === p.name))
  const standalonePatches = selectedPatches.filter(p => STANDALONE_PATCHES.some(s => s.name === p.name))

  // Check if feature patches need three-way merge
  const mergeCheck = threeWayMerge(featurePatches, targetDir)

  if (mergeCheck.needsMerge) {
    log('\n  Feature patches modify overlapping files, using three-way merge...')

    // For three-way merge, we'll use a temp directory approach:
    // 1. For each patch, create a temp branch and apply it
    // 2. Merge branches together
    // 3. Reset to merged state

    const tempBranches = []
    const baseRef = DESKTOP_TAG

    try {
      for (const patch of featurePatches) {
        // Start from clean base for each patch
        exec(`git checkout ${baseRef}`, { cwd: targetDir })

        const branchName = `temp-patch-${patch.name}-${Date.now()}`
        exec(`git checkout -b ${branchName}`, { cwd: targetDir })

        const result = applyPatch(path.join(PATCHES_DIR, patch.file), targetDir)
        if (!result.success) {
          throw new Error(`Failed to apply ${patch.name}: ${result.error}`)
        }

        exec(`git add -A && git commit -m "Apply ${patch.name}"`, { cwd: targetDir })
        tempBranches.push(branchName)
      }

      // Merge all temp branches
      if (tempBranches.length > 0) {
        exec(`git checkout ${tempBranches[0]}`, { cwd: targetDir })

        for (let i = 1; i < tempBranches.length; i++) {
          const mergeResult = spawnSync('git', ['merge', '--no-edit', tempBranches[i]], {
            cwd: targetDir,
            encoding: 'utf8',
          })

          if (mergeResult.status !== 0) {
            // Check for conflicts
            const status = exec('git status --porcelain', { cwd: targetDir })
            if (status && status.includes('UU')) {
              throw new Error(`Merge conflict between patches. Run --test to verify combinations.`)
            }
          }
        }

        // Stay on merged state (we're on first temp branch with all merges applied)
      }

    } finally {
      // Cleanup temp branches (except current one which has the merged result)
      const currentBranch = exec('git rev-parse --abbrev-ref HEAD', { cwd: targetDir })
      for (const branch of tempBranches) {
        if (branch !== currentBranch) {
          exec(`git branch -D ${branch} 2>/dev/null`, { cwd: targetDir })
        }
      }
    }

    for (const patch of featurePatches) {
      logSuccess(patch.file)
    }

  } else {
    // No overlap - apply feature patches directly
    for (const patch of featurePatches) {
      const result = applyPatch(path.join(PATCHES_DIR, patch.file), targetDir)
      if (result.success) {
        logSuccess(patch.file)
      } else {
        logError(`${patch.file}: ${result.error}`)
        return false
      }
    }
  }

  // Apply standalone patches directly
  for (const patch of standalonePatches) {
    const result = applyPatch(path.join(PATCHES_DIR, patch.file), targetDir)
    if (result.success) {
      logSuccess(patch.file)
    } else {
      logError(`${patch.file}: ${result.error}`)
      return false
    }
  }

  return true
}

async function testCombinations(targetDir) {
  log('\nTesting all patch combinations...', colors.cyan)

  const n = ALL_PATCHES.length
  const totalCombinations = Math.pow(2, n) - 1 // Exclude empty set

  log(`Testing ${totalCombinations} combinations...\n`)

  const results = []

  // Helper to fully reset repo
  const resetRepo = () => {
    exec(`git checkout ${DESKTOP_TAG}`, { cwd: targetDir })
    exec(`git reset --hard ${DESKTOP_TAG}`, { cwd: targetDir })
    exec('git clean -fd', { cwd: targetDir })
    // Clean up any leftover temp branches
    const branches = exec('git branch', { cwd: targetDir }) || ''
    branches.split('\n').forEach(b => {
      const name = b.trim().replace(/^\* /, '')
      if (name.startsWith('temp-patch-')) {
        exec(`git branch -D ${name}`, { cwd: targetDir })
      }
    })
  }

  for (let mask = 1; mask <= totalCombinations; mask++) {
    const selectedPatches = ALL_PATCHES.filter((_, i) => mask & (1 << i))
    const names = selectedPatches.map(p => p.name).join(' + ')

    process.stdout.write(`  Testing: ${names}... `)

    // Reset to clean state
    resetRepo()

    try {
      const success = await applyPatches(selectedPatches, targetDir)
      if (success) {
        console.log(colors.green + 'OK' + colors.reset)
        results.push({ combination: names, success: true })
      } else {
        console.log(colors.red + 'FAILED' + colors.reset)
        results.push({ combination: names, success: false })
      }
    } catch (e) {
      console.log(colors.red + 'FAILED' + colors.reset)
      results.push({ combination: names, success: false, error: e.message })
    }
  }

  // Reset back to clean
  resetRepo()

  // Summary
  const failed = results.filter(r => !r.success)

  log('\n' + '='.repeat(50))
  if (failed.length === 0) {
    log('All combinations passed!', colors.green)
    return true
  } else {
    log(`${failed.length} combination(s) failed:`, colors.red)
    for (const f of failed) {
      log(`  - ${f.combination}${f.error ? `: ${f.error}` : ''}`)
    }
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isTestMode = args.includes('--test')

  console.log('\n' + '='.repeat(50))
  console.log('  GitHub Desktop Patcher')
  console.log('='.repeat(50))

  const totalSteps = isTestMode ? 3 : 5

  // Step 1: Check prerequisites
  logStep(1, totalSteps, 'Checking prerequisites...')
  const prereqs = checkPrerequisites()

  if (!prereqs.passed) {
    log('\nMissing required dependencies. Please install them and try again.')
    process.exit(1)
  }

  if (prereqs.warnings.length > 0 && !isTestMode) {
    const proceed = await promptYesNo('\nSome optional dependencies are missing. Continue anyway?', true)
    if (!proceed) process.exit(0)
  }

  // Step 2: Setup repository
  logStep(2, totalSteps, 'Setting up repository...')

  const defaultPath = path.resolve(__dirname, '..', 'desktop')
  const targetPath = args.find(a => !a.startsWith('--')) || defaultPath

  if (!args.find(a => !a.startsWith('--'))) {
    const customPath = await prompt(`  Desktop repo location [${defaultPath}]: `)
    if (customPath) {
      const resolvedPath = path.resolve(customPath)
      const success = await setupRepository(resolvedPath)
      if (!success) process.exit(1)
      args.push(resolvedPath) // Use this path going forward
    } else {
      const success = await setupRepository(defaultPath)
      if (!success) process.exit(1)
    }
  } else {
    const success = await setupRepository(targetPath)
    if (!success) process.exit(1)
  }

  const finalTargetPath = args.find(a => !a.startsWith('--')) || defaultPath

  // Test mode - run all combinations
  if (isTestMode) {
    logStep(3, totalSteps, 'Testing patch combinations...')
    const success = await testCombinations(finalTargetPath)
    process.exit(success ? 0 : 1)
  }

  // Step 3: Select features
  logStep(3, totalSteps, 'Select features')
  const selectedPatches = await promptSelect(ALL_PATCHES, 'Select patches to apply:')

  if (selectedPatches.length === 0) {
    log('\nNo patches selected. Exiting.')
    process.exit(0)
  }

  // Step 4: Apply patches
  logStep(4, totalSteps, 'Applying patches...')
  const success = await applyPatches(selectedPatches, finalTargetPath)

  if (!success) {
    log('\nPatch application failed. Repository may be in inconsistent state.')
    log('Run: git reset --hard && git clean -fd')
    process.exit(1)
  }

  // Step 5: Build guidance
  logStep(5, totalSteps, 'Ready to build!')

  console.log(`
  Patches applied successfully! Next steps:

  1. Install dependencies:
     cd "${finalTargetPath}"
     yarn

  2. Build the app:
     yarn build:prod

  3. Package (optional):
     yarn package

  The built app will be in dist/
`)

  const runBuild = await promptYesNo('Run build now?', false)
  if (runBuild) {
    try {
      log('\nRunning yarn...')
      execSync('yarn', { cwd: finalTargetPath, stdio: 'inherit' })
      logSuccess('Dependencies installed')

      log('\nRunning yarn build:prod...')
      execSync('yarn build:prod', { cwd: finalTargetPath, stdio: 'inherit' })
      logSuccess('Build complete!')
    } catch (e) {
      logError('Build failed')
      process.exit(1)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
