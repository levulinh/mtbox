#!/bin/bash
# Linear pre-check — lightweight API query to determine if an agent has work.
# Returns exit 0 if work exists, exit 1 if nothing to do.
# Uses $LINEAR_API_KEY from the environment.
#
# Usage: linear-precheck.sh <agent>
#   agent: pm | cto | designer | programmer | qa

set -e

AGENT="$1"
TEAM_ID="86ce1fdb-7a21-4eb3-a9cc-b0504f3363ad"

if [ -z "$LINEAR_API_KEY" ]; then
  echo "[precheck] WARNING: LINEAR_API_KEY not set, skipping pre-check" >&2
  exit 0  # fail-open: run the agent if we can't check
fi

# Query Linear GraphQL for issue counts in specific statuses
query_issues() {
  local state_name="$1"
  local result
  result=$(python3 -c "
import json, urllib.request, os, sys
query = '''
{
  issues(filter: {
    team: { id: { eq: \"$TEAM_ID\" } }
    state: { name: { eq: \"%s\" } }
  }, first: 1) { nodes { id } }
}
''' % sys.argv[1]
payload = json.dumps({'query': query}).encode()
req = urllib.request.Request(
    'https://api.linear.app/graphql',
    data=payload,
    headers={'Content-Type': 'application/json', 'Authorization': os.environ['LINEAR_API_KEY']}
)
try:
    resp = urllib.request.urlopen(req, timeout=10).read()
    data = json.loads(resp)
    nodes = data.get('data', {}).get('issues', {}).get('nodes', [])
    print(len(nodes))
except Exception as e:
    print('0', file=sys.stdout)
    print(f'precheck error: {e}', file=sys.stderr)
" "$state_name" 2>/dev/null)
  echo "$result"
}

case "$AGENT" in
  pm)
    backlog=$(query_issues "Backlog")
    awaiting=$(query_issues "Awaiting Decision")
    if [ "$backlog" -gt 0 ] 2>/dev/null || [ "$awaiting" -gt 0 ] 2>/dev/null; then
      exit 0
    fi
    exit 1
    ;;

  cto)
    approval=$(query_issues "Awaiting Design Approval")
    # Also check for new CTO Directives in Backlog (separate query with project filter)
    directives=$(python3 -c "
import json, urllib.request, os
query = '''
{
  issues(filter: {
    team: { id: { eq: \"$TEAM_ID\" } }
    state: { name: { eq: \"Backlog\" } }
    project: { name: { eq: \"CTO Directives\" } }
  }, first: 1) { nodes { id } }
}
'''
payload = json.dumps({'query': query}).encode()
req = urllib.request.Request(
    'https://api.linear.app/graphql',
    data=payload,
    headers={'Content-Type': 'application/json', 'Authorization': os.environ['LINEAR_API_KEY']}
)
try:
    resp = urllib.request.urlopen(req, timeout=10).read()
    data = json.loads(resp)
    nodes = data.get('data', {}).get('issues', {}).get('nodes', [])
    print(len(nodes))
except Exception as e:
    print('0')
" 2>/dev/null)
    if [ "$approval" -gt 0 ] 2>/dev/null || [ "$directives" -gt 0 ] 2>/dev/null; then
      exit 0
    fi
    exit 1
    ;;

  designer)
    count=$(query_issues "In Design")
    if [ "$count" -gt 0 ] 2>/dev/null; then exit 0; fi
    exit 1
    ;;

  programmer)
    count=$(query_issues "In Progress")
    if [ "$count" -gt 0 ] 2>/dev/null; then exit 0; fi
    exit 1
    ;;

  qa)
    count=$(query_issues "In Review")
    if [ "$count" -gt 0 ] 2>/dev/null; then exit 0; fi
    exit 1
    ;;

  *)
    echo "[precheck] Unknown agent: $AGENT" >&2
    exit 0  # fail-open
    ;;
esac
