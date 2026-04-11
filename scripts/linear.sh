#!/bin/bash
# Linear API write helper — uses $LINEAR_API_KEY env var (the calling bot's key)
#
# Usage:
#   linear.sh comment        <issue-id> <body>
#   linear.sh move           <issue-id> <state-name>   (state-name = exact workflow status name)
#   linear.sh create         <team-id> <project-id> <state-name> <title> <description>
#   linear.sh create-project <team-id> <name> <description>   (prints new project ID)
#   linear.sh upload-image   <file-path>                       (uploads PNG to Linear CDN, prints asset URL)
#   linear.sh label          <issue-id> <label-name>
#   linear.sh assignee       <issue-id> <user-id>       (user-id = Linear user UUID, or "none")
#
# All operations are attributed to the account that owns $LINEAR_API_KEY.

set -e

GRAPHQL="https://api.linear.app/graphql"
CMD="$1"

gql() {
  local query="$1"
  python3 - "$query" << 'PYEOF'
import sys, json, urllib.request, os
query = sys.argv[1]
payload = json.dumps({"query": query}).encode()
req = urllib.request.Request(
    "https://api.linear.app/graphql",
    data=payload,
    headers={"Content-Type": "application/json", "Authorization": os.environ["LINEAR_API_KEY"]}
)
resp = urllib.request.urlopen(req).read()
result = json.loads(resp)
if result.get("errors"):
    print("ERROR:", json.dumps(result["errors"]), file=sys.stderr)
    sys.exit(1)
print(json.dumps(result.get("data", {})))
PYEOF
}

gql_vars() {
  local query="$1"
  local variables="$2"
  python3 - "$query" "$variables" << 'PYEOF'
import sys, json, urllib.request, os
query = sys.argv[1]
variables = json.loads(sys.argv[2])
payload = json.dumps({"query": query, "variables": variables}).encode()
req = urllib.request.Request(
    "https://api.linear.app/graphql",
    data=payload,
    headers={"Content-Type": "application/json", "Authorization": os.environ["LINEAR_API_KEY"]}
)
resp = urllib.request.urlopen(req).read()
result = json.loads(resp)
if result.get("errors"):
    print("ERROR:", json.dumps(result["errors"]), file=sys.stderr)
    sys.exit(1)
print(json.dumps(result.get("data", {})))
PYEOF
}

case "$CMD" in

  comment)
    ISSUE_ID="$2"
    BODY="$3"
    gql_vars \
      'mutation CreateComment($issueId: String!, $body: String!) { commentCreate(input: {issueId: $issueId, body: $body}) { success comment { id } } }' \
      "{\"issueId\": \"$ISSUE_ID\", \"body\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$BODY")}"
    ;;

  move)
    ISSUE_ID="$2"
    STATE_NAME="$3"
    # Resolve state ID by name (queries the issue's team workflow states)
    STATE_ID=$(gql "{ issue(id: \"$ISSUE_ID\") { team { states { nodes { id name } } } } }" | \
      python3 -c "import sys,json; states=json.load(sys.stdin)['issue']['team']['states']['nodes']; match=[s for s in states if s['name']=='$STATE_NAME']; print(match[0]['id']) if match else sys.exit(1)")
    gql_vars \
      'mutation MoveIssue($id: String!, $stateId: String!) { issueUpdate(id: $id, input: {stateId: $stateId}) { success } }' \
      "{\"id\": \"$ISSUE_ID\", \"stateId\": \"$STATE_ID\"}"
    ;;

  create)
    TEAM_ID="$2"
    PROJECT_ID="$3"
    STATE_NAME="$4"
    TITLE="$5"
    DESCRIPTION="$6"
    # Resolve state ID by name
    STATE_ID=$(gql "{ team(id: \"$TEAM_ID\") { states { nodes { id name } } } }" | \
      python3 -c "import sys,json; states=json.load(sys.stdin)['team']['states']['nodes']; match=[s for s in states if s['name']=='$STATE_NAME']; print(match[0]['id']) if match else sys.exit(1)")
    gql_vars \
      'mutation CreateIssue($teamId: String!, $projectId: String!, $stateId: String!, $title: String!, $description: String!) { issueCreate(input: {teamId: $teamId, projectId: $projectId, stateId: $stateId, title: $title, description: $description}) { success issue { id identifier } } }' \
      "{\"teamId\": \"$TEAM_ID\", \"projectId\": \"$PROJECT_ID\", \"stateId\": \"$STATE_ID\", \"title\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$TITLE"), \"description\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$DESCRIPTION")}"
    ;;

  create-sub)
    # linear.sh create-sub <team-id> <project-id> <state-name> <parent-issue-id> <title> <description>
    # Creates a sub-issue (child) under the given parent issue. Prints the new issue's id and identifier.
    TEAM_ID="$2"
    PROJECT_ID="$3"
    STATE_NAME="$4"
    PARENT_ID="$5"
    TITLE="$6"
    DESCRIPTION="$7"
    STATE_ID=$(gql "{ team(id: \"$TEAM_ID\") { states { nodes { id name } } } }" | \
      python3 -c "import sys,json; states=json.load(sys.stdin)['team']['states']['nodes']; match=[s for s in states if s['name']=='$STATE_NAME']; print(match[0]['id']) if match else sys.exit(1)")
    gql_vars \
      'mutation CreateSubIssue($teamId: String!, $projectId: String!, $stateId: String!, $parentId: String!, $title: String!, $description: String!) { issueCreate(input: {teamId: $teamId, projectId: $projectId, stateId: $stateId, parentId: $parentId, title: $title, description: $description}) { success issue { id identifier } } }' \
      "{\"teamId\": \"$TEAM_ID\", \"projectId\": \"$PROJECT_ID\", \"stateId\": \"$STATE_ID\", \"parentId\": \"$PARENT_ID\", \"title\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$TITLE"), \"description\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$DESCRIPTION")}"
    ;;

  label)
    ISSUE_ID="$2"
    LABEL_NAME="$3"
    # Find or create label by name in the issue's team
    LABEL_ID=$(gql "{ issue(id: \"$ISSUE_ID\") { team { labels { nodes { id name } } } } }" | \
      python3 -c "import sys,json; labels=json.load(sys.stdin)['issue']['team']['labels']['nodes']; match=[l for l in labels if l['name']=='$LABEL_NAME']; print(match[0]['id']) if match else print('')")
    if [ -z "$LABEL_ID" ]; then
      echo "Label '$LABEL_NAME' not found in team" >&2
      exit 1
    fi
    gql_vars \
      'mutation AddLabel($issueId: String!, $labelId: String!) { issueAddLabel(id: $issueId, labelId: $labelId) { success } }' \
      "{\"issueId\": \"$ISSUE_ID\", \"labelId\": \"$LABEL_ID\"}"
    ;;

  assignee)
    ISSUE_ID="$2"
    USER_ID="$3"
    if [ "$USER_ID" = "none" ]; then
      gql_vars \
        'mutation UnassignIssue($id: String!) { issueUpdate(id: $id, input: {assigneeId: null}) { success } }' \
        "{\"id\": \"$ISSUE_ID\"}"
    else
      gql_vars \
        'mutation AssignIssue($id: String!, $assigneeId: String!) { issueUpdate(id: $id, input: {assigneeId: $assigneeId}) { success } }' \
        "{\"id\": \"$ISSUE_ID\", \"assigneeId\": \"$USER_ID\"}"
    fi
    ;;

  upload-image)
    # linear.sh upload-image <file-path>
    # Uploads an image file to Linear CDN and prints the asset URL to stdout
    FILE_PATH="$2"
    FILENAME=$(basename "$FILE_PATH")
    CONTENT_TYPE="image/png"
    FILE_SIZE=$(wc -c < "$FILE_PATH" | tr -d ' ')

    # Step 1: get presigned upload URL + asset URL from Linear
    UPLOAD_DATA=$(gql_vars \
      'mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) { fileUpload(contentType: $contentType, filename: $filename, size: $size) { success uploadFile { uploadUrl assetUrl headers { key value } } } }' \
      "{\"contentType\": \"$CONTENT_TYPE\", \"filename\": \"$FILENAME\", \"size\": $FILE_SIZE}")

    UPLOAD_URL=$(echo "$UPLOAD_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fileUpload']['uploadFile']['uploadUrl'])")
    ASSET_URL=$(echo "$UPLOAD_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fileUpload']['uploadFile']['assetUrl'])")

    # Build header flags for curl from the headers array
    HEADER_FLAGS=$(echo "$UPLOAD_DATA" | python3 -c "
import sys, json, shlex
d = json.load(sys.stdin)
headers = d['fileUpload']['uploadFile']['headers']
print(' '.join('-H ' + shlex.quote(h['key'] + ': ' + h['value']) for h in headers))
")

    # Step 2: PUT the file to the presigned URL
    # Content-Type must be included — it's part of the GCS signed headers even though
    # Linear's API doesn't return it in the headers array
    eval "curl -s -X PUT '$UPLOAD_URL' -H 'Content-Type: $CONTENT_TYPE' $HEADER_FLAGS --upload-file '$FILE_PATH'" > /dev/null

    # Print the permanent asset URL for use in comments
    echo "$ASSET_URL"
    ;;

  create-project)
    # linear.sh create-project <team-id> <name> <description>
    # Prints the new project's ID on stdout
    TEAM_ID="$2"
    NAME="$3"
    DESCRIPTION="$4"
    gql_vars \
      'mutation CreateProject($teamIds: [String!]!, $name: String!, $description: String) { projectCreate(input: {teamIds: $teamIds, name: $name, description: $description}) { success project { id name } } }' \
      "{\"teamIds\": [\"$TEAM_ID\"], \"name\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$NAME"), \"description\": $(python3 -c "import sys,json; print(json.dumps(sys.argv[1]))" "$DESCRIPTION")}" | \
      python3 -c "import sys,json; data=json.load(sys.stdin); print(data['projectCreate']['project']['id'])"
    ;;

  *)
    echo "Usage: linear.sh <comment|move|create|create-sub|create-project|label|assignee> [args...]" >&2
    exit 1
    ;;
esac
