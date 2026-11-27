#!/usr/bin/env bash
# Checks which images deploy/deploy.sh removes, with a stand-in docker. Needs a sed that takes -i alone:
#   docker run --rm -v "$PWD":/w -w /w bash:5 bash scripts/deploy.test.sh
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cp "$root/deploy/deploy.sh" "$dir/"
echo 'POSTGRES_PASSWORD=x' > "$dir/.env"
mkdir "$dir/bin"
cat > "$dir/bin/docker" <<'FAKE'
#!/usr/bin/env bash
case "$*" in
  'compose up'*) exit "${UP_EXIT:-0}" ;;
  'image ls '*) for tag in $TAGS; do echo "$tag"; done ;;
  'image rm '*) echo "$3" >> "$REMOVED" ;;
esac
FAKE
chmod +x "$dir/bin/docker"

a=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
b=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
c=cccccccccccccccccccccccccccccccccccccccc
d=dddddddddddddddddddddddddddddddddddddddd

# deploy <sha> <tags on the machine>
deploy() {
  : > "$dir/removed"
  PATH="$dir/bin:$PATH" REMOVED="$dir/removed" TAGS="$2" bash "$dir/deploy.sh" "$1" >/dev/null
}
# The expected removals of these tags, from both repositories.
images() {
  for repo in server web; do
    for tag in "$@"; do echo "ghcr.io/quocduy21-10/chess-$repo:$tag"; done
  done | sort | tr '\n' ' '
}
expect() { # expect <step> <removals>
  local got
  got=$(sort "$dir/removed" | tr '\n' ' ')
  [[ $got == "$2" ]] || { echo "FAIL $1: removed [$got], expected [$2]" >&2; exit 1; }
}

deploy "$a" "$a";       expect 'first deploy' "$(images)"
deploy "$b" "$a $b";    expect 'second deploy keeps the first' "$(images)"
deploy "$c" "$a $b $c"; expect 'third deploy drops the oldest' "$(images "$a")"
deploy "$c" "$b $c";    expect 'a redeploy keeps the previous version' "$(images)"
if UP_EXIT=1 deploy "$d" "$b $c $d"; then echo "FAIL: an unhealthy deploy succeeded" >&2; exit 1; fi
expect 'an unhealthy deploy removes nothing' "$(images)"
deploy "$d" "$b $c $d"; expect 'the next healthy deploy keeps the last good one' "$(images "$b")"
echo "deploy.sh keeps the current and previous versions"
