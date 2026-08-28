#!/usr/bin/env bash
# Checks every page for every role against a running dev server.
#   ./scripts/smoke.sh [base-url]
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

BASE="${1:-http://localhost:3100}"
PAGES=(dashboard users access academic classes students assignments attendance periods period-attendance observations tasks reports period-reports audit profile)
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
    body=$(mktemp)
    read -r code location < <(curl -s -o "$body" \
      -w '%{http_code} %{redirect_url}\n' \
      -H "Cookie: eduplus_session=$token" "$BASE/$page")

    # A blocked module is `redirect("/denied")`, and how that arrives depends on
    # the build: production answers 307 with a Location, while the dev server
    # answers 200 and a <meta http-equiv="refresh"> to /denied. Reading only the
    # status code would score every denied page as "ok" and hide a real
    # access regression, so both forms are checked.
    denied=0
    case "$location" in */denied) denied=1 ;; esac
    if grep -q 'url=/denied\|data-page="denied"' "$body"; then denied=1; fi

    if [ "$denied" -eq 1 ]; then
      printf "%-13s" "denied"
    else
      case "$code" in
        200) printf "%-13s" "ok" ;;
        # A valid session should never bounce anywhere but /denied.
        302|303|307|308) printf "%-13s" "REDIR"; fail=1 ;;
        *) printf "%-13s" "FAIL($code)"; fail=1 ;;
      esac
    fi
    rm -f "$body"
  done
  echo
done

echo
if [ "$fail" -eq 0 ]; then echo "All pages responded correctly."; else echo "Some pages returned errors."; fi
exit "$fail"
