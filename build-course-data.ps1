# ============================================================
# build-course-data.ps1
# Reads every source markdown course and emits assets/course-data.js
# so the platform runs fully offline from file:// with no server,
# no fetch and no CORS issues.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\build-course-data.ps1
# ============================================================

param(
    [string]$SourceDir = (Split-Path -Parent $PSScriptRoot),
    [string]$Out       = (Join-Path $PSScriptRoot 'assets\course-data.js')
)

$ErrorActionPreference = 'Stop'
$SourceDir = (Resolve-Path $SourceDir).Path

# ----- courses bundled into the platform (edit here to add more) -----
$Courses = @(
    [pscustomobject]@{
        id       = 'java-backend'
        file     = 'java-backend-course.md'
        title    = 'Java Backend Development: From Zero to Job-Ready'
        subtitle = 'The complete 28-module path: Core Java, OOP, collections, streams, Git, HTTP/REST, Spring Boot, PostgreSQL, JPA, testing, security, Docker, CI/CD, a full capstone project and job preparation.'
        accent   = '#ff9f43'
    },
    [pscustomobject]@{
        id       = 'java-backend-v2'
        file     = 'java-backend-course v2.md'
        title    = 'Java Backend Development (Expanded Edition)'
        subtitle = 'An expanded A-to-H path: environment setup, core Java, engineering tools, web foundations, Spring Boot, a finished portfolio project, job preparation and working effectively with AI.'
        accent   = '#45d9c0'
    },
    [pscustomobject]@{
        id       = 'troubleshooting'
        file     = 'java-spring-postgresql-troubleshooting-guide.md'
        title    = 'Spring + PostgreSQL Troubleshooting Guide'
        subtitle = 'The debugging reference: reading stack traces, logs and PostgreSQL errors, plus decision tables for compile, runtime, build, startup, REST, JPA/Hibernate, security, testing, Docker and performance problems.'
        accent   = '#58a6ff'
    },
    [pscustomobject]@{
        id       = 'postgresql'
        file     = 'postgresql-database-engineering-course.md'
        title    = 'PostgreSQL & Database Engineering'
        subtitle = 'A backend-focused database engineering course: foundations, SQL, CTEs, window functions, advanced JOINs and JSONB, full-text search, views and query performance.'
        accent   = '#c792ea'
    }
)

function ConvertTo-JsString([string]$s) {
    if ([string]::IsNullOrEmpty($s)) { return '""' }
    $s = $s -replace "`r`n", "`n"
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $s.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"')      { [void]$sb.Append('\"') }
        elseif ($ch -eq '\')  { [void]$sb.Append('\\') }
        elseif ($code -eq 10) { [void]$sb.Append('\n') }
        elseif ($code -eq 9)  { [void]$sb.Append('\t') }
        elseif ($code -eq 8)  { [void]$sb.Append('\b') }
        elseif ($code -eq 12) { [void]$sb.Append('\f') }
        elseif ($code -eq 13) { } # drop bare CR
        elseif ($code -eq 60) { [void]$sb.Append('\u003c') }
        elseif ($code -eq 62) { [void]$sb.Append('\u003e') }
        elseif ($code -eq 38) { [void]$sb.Append('\u0026') }
        elseif ($code -lt 32 -or $code -eq 127) { [void]$sb.AppendFormat('\u{0:X4}', $code) }
        else { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function Add-Section($list, $title, $part, $bodyLines) {
    if ([string]::IsNullOrWhiteSpace($title)) { return }
    $body = ($bodyLines -join "`n").Trim("`n")
    $list.Add([pscustomobject]@{
        title = $title.Trim()
        part  = $part
        body  = $body
    })
}

function Split-Course([string]$text, [ref]$courseTitle) {
    $lines = $text -split "`n"
    $sections = New-Object System.Collections.Generic.List[object]

    $title = 'Overview'
    $part  = $null
    $body  = New-Object System.Collections.Generic.List[string]

    $inFence   = $false
    $fenceLang = ''
    $innerFence = 0
    $seenH1    = $false
    $sawAnyH2  = $false

    foreach ($raw in $lines) {
        $line = $raw.TrimEnd("`r")

        # --- code fences (allow indentation; support nested fences inside markdown examples) ---
        if (-not $inFence) {
            if ($line -match '^\s*(`{3,}|~{3,})\s*(.*)$') {
                $inFence = $true
                $fenceLang = (($Matches[2].Trim() -split '\s+')[0]).ToLower()
                $innerFence = 0
                $body.Add($line)
                continue
            }
        } else {
            if ($line -match '^\s*(`{3,}|~{3,})\s*$') {
                if (($fenceLang -eq 'markdown' -or $fenceLang -eq 'md') -and $innerFence -gt 0) {
                    $innerFence--
                    $body.Add($line)
                    continue
                }
                $inFence = $false
                $body.Add($line)
                continue
            }
            if (($fenceLang -eq 'markdown' -or $fenceLang -eq 'md') -and $line -match '^\s*(`{3,}|~{3,})\s*\S') {
                $innerFence++
                $body.Add($line)
                continue
            }
            $body.Add($line)
            continue
        }

        # --- H1: first one is the course title, later ones group sections ---
        $h1 = [regex]::Match($line, '^#\s+(.+?)\s*$')
        if ($h1.Success) {
            if (-not $seenH1) {
                $seenH1 = $true
                $courseTitle.Value = $h1.Groups[1].Value.Trim()
                continue
            }
            Add-Section $sections $title $part $body
            $title = 'Overview'
            $part  = $h1.Groups[1].Value.Trim()
            $body  = New-Object System.Collections.Generic.List[string]
            $sawAnyH2 = $false
            continue
        }

        # --- H2: a section ---
        $h2 = [regex]::Match($line, '^##\s+(.+?)\s*$')
        if ($h2.Success) {
            Add-Section $sections $title $part $body
            $title = $h2.Groups[1].Value.Trim()
            $body  = New-Object System.Collections.Generic.List[string]
            $sawAnyH2 = $true
            continue
        }

        $body.Add($line)
    }
    Add-Section $sections $title $part $body

    # drop a leading "Overview" section that has no real content
    $clean = New-Object System.Collections.Generic.List[object]
    foreach ($s in $sections) {
        if ($s.title -eq 'Overview' -and [string]::IsNullOrWhiteSpace($s.body)) { continue }
        $clean.Add($s)
    }
    return $clean
}

# ----- build the JS output -----
$sbCourse = New-Object System.Text.StringBuilder
[void]$sbCourse.Append("window.COURSES = {`n  generated: ")
[void]$sbCourse.Append((ConvertTo-JsString ((Get-Date).ToString('u'))))
[void]$sbCourse.Append(",`n  courses: [`n")

$summary = @()
$firstCourse = $true

foreach ($c in $Courses) {
    $src = Join-Path $SourceDir $c.file
    if (-not (Test-Path -LiteralPath $src)) {
        Write-Warning "Missing source: $src"
        continue
    }
    $md = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)

    $courseTitle = $c.title
    $sections = Split-Course $md ([ref]$courseTitle)

    if (-not $firstCourse) { [void]$sbCourse.Append(",`n") }
    $firstCourse = $false

    [void]$sbCourse.Append('    {')
    [void]$sbCourse.Append('id:' + (ConvertTo-JsString $c.id) + ',')
    [void]$sbCourse.Append('title:' + (ConvertTo-JsString $c.title) + ',')
    [void]$sbCourse.Append('subtitle:' + (ConvertTo-JsString $c.subtitle) + ',')
    [void]$sbCourse.Append('accent:' + (ConvertTo-JsString $c.accent) + ',')
    [void]$sbCourse.Append('sections:[')

    for ($i = 0; $i -lt $sections.Count; $i++) {
        $s = $sections[$i]
        if ($i -gt 0) { [void]$sbCourse.Append(',') }
        [void]$sbCourse.Append('{')
        [void]$sbCourse.Append('title:' + (ConvertTo-JsString $s.title) + ',')
        [void]$sbCourse.Append('part:' + (ConvertTo-JsString $s.part) + ',')
        [void]$sbCourse.Append('body:' + (ConvertTo-JsString $s.body))
        [void]$sbCourse.Append('}')
    }
    [void]$sbCourse.Append(']}')

    $summary += [pscustomobject]@{ Course = $c.id; Sections = $sections.Count }
}

[void]$sbCourse.Append("`n  ]`n};`n")

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($Out, $sbCourse.ToString(), $utf8)

$kb = [math]::Round((Get-Item $Out).Length / 1KB, 1)
Write-Host ("Wrote {0} ({1} KB)" -f $Out, $kb)
foreach ($s in $summary) { Write-Host ("  {0,-16} {1} sections" -f $s.Course, $s.Sections) }
