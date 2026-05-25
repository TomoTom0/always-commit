#!/bin/bash
# always-commit hook for Claude Code
#
# Hook type: UserPromptSubmit
# Event: Fired when the user submits a prompt to Claude Code
#
# This script saves a snapshot with a timestamp as the commit message
# each time a prompt is submitted, creating a recovery point.
#
# Setup: See docs/usage/agent-integration.md

set -e

# Skip if alcom is not installed
if ! command -v alcom &>/dev/null; then
    exit 0
fi

# Save snapshot with auto-generated message from diff stat
# (silently - errors must not block the user prompt)
alcom save --auto >/dev/null 2>&1 || true
