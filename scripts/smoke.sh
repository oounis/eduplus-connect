#!/usr/bin/env bash
# Checks every page for every role against a running dev server.
#   ./scripts/smoke.sh [base-url]
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

BASE="${1:-http://localhost:3100}"
PAGES=(dashboard users access academic classes students assignments attendance observations tasks reports audit profile)
ACCOUNTS=(admin deputy staff supervisor teacher parent student)

fail=0
printf "%-12s" "role"
for page in "${PAGES[@]}"; do printf "%-13s" "$page"; done
echo

for account in "${ACCOUNTS[@]}"; do
  token=$(npx --no-install tsx scripts/dev-token.ts "${account}@eduplus.school" 2>/dev/null)
  if [ -z "$token" ]; then echo "$account: could not mint token"; fail=1; continue; fi
  printf "%-12s" "$account"
  for page in "${PAGES[@]}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: eduplus_session=$token" \
      "$BASE/$page")
    # 200 = granted, 307/302 = redirected to /denied (correct for ungranted modules)
    case "$code" in
      200) printf "%-13s" "ok" ;;
      302|303|307|308) printf "%-13s" "denied" ;;
      *) printf "%-13s" "FAIL($code)"; fail=1 ;;
    esac
  done
  echo
done

echo
if [ "$fail" -eq 0 ]; then echo "All pages responded correctly."; else echo "Some pages returned errors."; fi
exit "$fail"
