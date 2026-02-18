---
name: commit-style
description: Git commit message style guide following conventional commits
version: "1.0"
tags: [git, commit, workflow, 提交, 提交规范]
priority: high
eligibility:
  bin: [git]
---

# Commit Message Style Guide

When the user asks you to create a git commit, follow these conventions:

## Format

```
type: subject
```

## Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no behavior change)
- `docs`: Documentation only
- `style`: Formatting, whitespace (no logic change)
- `test`: Adding or updating tests
- `chore`: Build, CI, dependency updates

## Rules

1. One commit per logical change
2. Subject line: imperative mood, lowercase, no period, max 72 chars
3. If changes are unrelated, suggest splitting into multiple commits
4. Use Chinese for commit subject if the user communicates in Chinese
