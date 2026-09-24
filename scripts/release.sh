#!/usr/bin/env bash
# Release @softspark/dsh-process-console. The only supported way to create a release tag.
#
#   npm run release -- X.Y.Z             gates, Linux run, pack smoke, tag, push, watch publish
#   npm run release -- X.Y.Z --dry-run   everything up to the tag; prints the rest
#   scripts/release.sh --gates-only      the gate alone (what the Linux container runs)
#
# `pnpm run release X.Y.Z` works the same way. GitHub Actions only publishes
# the tag; nothing there re-runs these checks, so a tag made by hand ships
# whatever was on the commit. See kb/procedures/sop-release.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

PKG="@softspark/dsh-process-console"
GH_REPO="softspark/dsh-process-console"
BRANCH="main"
LINUX_IMAGE="node:24"
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1]")"

die()  { printf 'release: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

# No pnpm installed: put corepack's shim for the pinned version on PATH. A shell
# function would not do, because package scripts call pnpm themselves.
if ! type -P pnpm >/dev/null; then
  PNPM_SHIM_DIR="$(mktemp -d)"
  trap 'rm -rf "$PNPM_SHIM_DIR"' EXIT
  corepack enable --install-directory "$PNPM_SHIM_DIR" pnpm
  export PATH="$PNPM_SHIM_DIR:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0
fi

# One gate per line on screen, full output in the log. A failure prints the
# tail so the cause is visible without opening the file.
LOG=""
run() {
  local name="$1"; shift
  printf '  %-44s ' "$name"
  printf '\n### %s\n$ %s\n' "$name" "$*" >>"$LOG"
  if "$@" >>"$LOG" 2>&1; then
    echo ok
  else
    echo FAILED
    printf -- '--- last 40 lines of %s\n' "$LOG"
    tail -n 40 "$LOG"
    exit 1
  fi
}

check_pnpm_version() {
  [ "$(pnpm --version)" = "$PNPM_VERSION" ] || { echo "pnpm $(pnpm --version), packageManager wants $PNPM_VERSION"; return 1; }
}

# lib/ is generated and must never be committed. Skipped inside the Linux
# container, which has no .git.
check_no_tracked_artifacts() {
  local offending
  [ -d .git ] || { echo "no .git here; checked on the host"; return 0; }
  offending="$(git ls-files | grep -E 'node_modules/|(^|/)lib/|\.tsbuildinfo$|\.zip$' || true)"
  [ -z "$offending" ] || { echo "tracked files that must be gitignored:"; echo "$offending"; return 1; }
}

sarif() { node scripts/audit.mjs --sarif >"$SARIF"; }

# The publish job is the one place provenance and script-free publishing can be
# lost. Comments are stripped first so prose cannot satisfy the check.
check_publish_controls() {
  local code
  code="$(sed 's/#.*//' .github/workflows/publish.yml)"
  printf '%s' "$code" | grep -q -- '--provenance' || { echo "publish.yml lost --provenance"; return 1; }
  printf '%s' "$code" | grep -q 'id-token: write' || { echo "publish.yml lost id-token: write"; return 1; }
  printf '%s' "$code" | grep -q -- 'npm publish.*--ignore-scripts' || { echo "publish.yml lost --ignore-scripts"; return 1; }
}

gates() {
  run "pnpm matches packageManager"          check_pnpm_version
  run "pnpm install --frozen-lockfile"       pnpm install --frozen-lockfile --ignore-scripts
  run "verify (files..lint, types, coverage)" pnpm run verify
  run "no build artifacts tracked"           check_no_tracked_artifacts
  run "audit (source rules)"                 pnpm run audit
  run "audit:permissions"                    pnpm run audit:permissions
  run "audit:dependencies (high+)"           pnpm run audit:dependencies
  run "audit:signatures"                     pnpm run audit:signatures
  run "SARIF report"                         sarif
  run "build (host, client, artifacts)"      pnpm run build
  run "npm pack --dry-run"                   npm pack --dry-run --ignore-scripts
  run "publish controls in publish.yml"      check_publish_controls
  # Summary only; a format change must not fail a green gate.
  sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -E '^ *Tests +[0-9]+ passed' | sed -n '1s/^ */  suite: /p' || true
  grep -E '^All files' "$LOG" | sed -En '1{s/ +/ /g; s/ $//; s/^/  coverage (stmts|branch|funcs|lines): /p;}' || true
}

# The tarball the tag will publish, built here and imported once. It is
# unpacked under node_modules so its bare imports resolve against the locked
# dependencies, the way an installed copy would. The browser bundle
# (lib/client.js) is checked for presence only; it needs the DSH client loader.
# `run` calls this in an `if`, where set -e does not apply: every step carries
# its own `|| return 1`.
pack_smoke() {
  local work tarball f target="node_modules/.release-smoke/dsh-process-console"
  work="$(mktemp -d)" || return 1
  tarball="$(npm pack --ignore-scripts --pack-destination "$work" | tail -n 1)" || return 1
  tar -tzf "$work/$tarball" | sed 's#^package/##' >"$work/entries.txt" || return 1
  cat "$work/entries.txt"
  for f in lib/index.js lib/invariant.js lib/client.js lib/types/index.d.ts \
           cordis.patch.yml LICENSE NOTICE README.md CHANGELOG.md package.json; do
    grep -qx "$f" "$work/entries.txt" || { echo "missing from tarball: $f"; return 1; }
  done
  ! grep -Eq '^(src|tests|kb|scripts|patches)/' "$work/entries.txt" || { echo "tarball ships sources, tests, KB, scripts or patches"; return 1; }
  rm -rf "$target" && mkdir -p "$target" || return 1
  tar -xzf "$work/$tarball" -C "$target" --strip-components 1 || return 1
  node --input-type=module -e "
    const entry = await import('./$target/lib/index.js');
    await import('./$target/lib/invariant.js');
    if (typeof entry.apply !== 'function') throw new Error('lib/index.js exports no apply()');
    console.log('import ok: apply, invariant');
  " || return 1
  rm -rf "$target" "$work"
}

# Step 4 applies: publish.yml builds the artefact on Linux with native tools
# (rolldown, lightningcss). A Linux-only build failure would otherwise surface
# after the tag. The old CI also ran on Windows; nothing local replaces that.
#
# The repository is copied in as a tar stream of the files git knows about,
# never mounted, so nothing in the container can write back to the checkout.
linux_gates() {
  local f tar_flags=()
  tar --version | grep -q bsdtar && tar_flags=(--no-xattrs --no-mac-metadata)
  git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done \
    | COPYFILE_DISABLE=1 tar ${tar_flags[@]+"${tar_flags[@]}"} --null -T - -cf - \
    | docker run --rm -i -e PNPM_VERSION="$PNPM_VERSION" "$LINUX_IMAGE" bash -euo pipefail -c '
        npm install --global --ignore-scripts "pnpm@$PNPM_VERSION" >/dev/null
        mkdir /work && tar -xf - -C /work && chown -R node:node /work
        cd /work && runuser -u node -- bash scripts/release.sh --gates-only'
}

watch_publish() {
  local version="$1" tag="$2" run_id="" i
  for i in $(seq 1 30); do
    run_id="$(gh run list --repo "$GH_REPO" --workflow publish.yml --branch "$tag" \
      --json databaseId --jq '.[0].databaseId // empty')"
    [ -n "$run_id" ] && break
    sleep 10
  done
  [ -n "$run_id" ] || die "no publish run appeared for $tag"
  gh run watch "$run_id" --repo "$GH_REPO" --exit-status || die "publish run $run_id failed"
  # A fresh version can 404 for a minute or two after publish succeeds.
  for i in $(seq 1 30); do
    [ "$(npm view "$PKG@$version" version 2>/dev/null)" = "$version" ] && break
    [ "$i" = 30 ] && die "$PKG@$version is not on the registry"
    sleep 10
  done
  gh release view "$tag" --repo "$GH_REPO" >/dev/null || die "no GitHub Release for $tag"
  echo "published: $PKG@$version, GitHub Release $tag"
}

usage() { sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

VERSION="" DRY_RUN=0 GATES_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --gates-only) GATES_ONLY=1 ;;
    -h|--help)    usage ;;
    -*)           die "unknown option: $arg" ;;
    *)            [ -z "$VERSION" ] || die "one version only"; VERSION="$arg" ;;
  esac
done

TMP_ROOT="${TMPDIR:-/tmp}"; TMP_ROOT="${TMP_ROOT%/}"

if [ "$GATES_ONLY" = 1 ]; then
  LOG="$TMP_ROOT/dsh-process-console-gates.log"; : >"$LOG"
  SARIF="$TMP_ROOT/dsh-process-console-audit.sarif"
  step "Gates (log: $LOG)"
  gates
  exit 0
fi

[ -n "$VERSION" ] || usage
TAG="v$VERSION"
OUT="$TMP_ROOT/dsh-process-console-release-$VERSION"
mkdir -p "$OUT"
LOG="$OUT/gates.log"; : >"$LOG"
SARIF="$OUT/audit.sarif"

step "1. Preconditions"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "not a semver X.Y.Z: $VERSION"
[ "$(git branch --show-current)" = "$BRANCH" ] || die "not on $BRANCH"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
git fetch --quiet origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] || die "$BRANCH differs from origin/$BRANCH"
! git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || die "tag $TAG exists locally"
! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null || die "tag $TAG exists on origin"
echo "  $BRANCH at $(git rev-parse --short HEAD), clean, in sync; $TAG is free"

step "2. Version and notes"
[ "$(node -p "require('./package.json').version")" = "$VERSION" ] || die "package.json is not $VERSION"
# package.json, the newest numbered CHANGELOG heading and the tag.
node scripts/verify-version-sync.mjs --tag "$TAG" || die "version surfaces disagree"
grep -Eq "^## \[$VERSION\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$" CHANGELOG.md || die "CHANGELOG.md has no dated '## [$VERSION] - YYYY-MM-DD' heading"
[ "$(git log -1 --format=%s)" = "chore: release v$VERSION" ] || die "HEAD is not 'chore: release v$VERSION'"
echo "  package.json, CHANGELOG.md and HEAD say $VERSION"

step "3. Gates (log: $LOG)"
gates

step "4. Linux run ($LINUX_IMAGE, log: $OUT/linux.log)"
if linux_gates >"$OUT/linux.log" 2>&1; then
  grep -E '^  (suite|coverage)' "$OUT/linux.log" | sed 's/^ */  linux /' || true
else
  tail -n 40 "$OUT/linux.log"; die "Linux gate failed"
fi

step "5. Build and smoke"
run "npm pack + import smoke" pack_smoke

if [ "$DRY_RUN" = 1 ]; then
  step "Dry run: would now"
  echo "  git tag -s $TAG -m 'Release $TAG'   # SSH-signed, on $(git rev-parse --short HEAD)"
  echo "  git push origin $BRANCH"
  echo "  git push origin refs/tags/$TAG"
  echo "  gh run watch <publish.yml run for $TAG>; npm view $PKG@$VERSION; gh release view $TAG"
  exit 0
fi

step "6. Tag and push"
git tag -s "$TAG" -m "Release $TAG"
[ "$(git rev-list -n 1 "$TAG")" = "$(git rev-parse HEAD)" ] || die "$TAG does not point at HEAD"
[ "$(git log -1 --format=%s "$TAG")" = "chore: release v$VERSION" ] || die "$TAG is not on the release commit"
git push origin "$BRANCH"
git push origin "refs/tags/$TAG"

step "7. Watch publish"
watch_publish "$VERSION" "$TAG"
