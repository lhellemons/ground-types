#!/usr/bin/env bash
# Publishes the packed tarball as the GitHub Release for $RELEASE_TAG.
#
# Needs the `gh` CLI with GH_TOKEN and GH_REPO set, and `pnpm pack` output in
# release-artifacts/. A release is replaced only while it is a draft:
#
#   no release yet     create a draft, upload the tarball, publish
#   draft              (re)upload the tarball, publish
#   already published  succeed if the published asset is byte-identical,
#                      otherwise fail without touching the release
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG must be set}"

shopt -s nullglob
tarballs=(release-artifacts/*.tgz)
if [ "${#tarballs[@]}" -ne 1 ]; then
  echo "::error::Expected exactly one tarball in release-artifacts/, found ${#tarballs[@]}"
  exit 1
fi
tarball=${tarballs[0]}
asset=$(basename "$tarball")

# A version with a hyphen (v1.0.0-rc.1) is a pre-release.
prerelease=false
case "$RELEASE_TAG" in
  *-*) prerelease=true ;;
esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Distinguish "no such release" from a failed lookup, so an auth or network
# error cannot be mistaken for a missing release.
if is_draft=$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft 2>"$work/view.err"); then
  :
elif grep -q 'release not found' "$work/view.err"; then
  is_draft=none
else
  cat "$work/view.err" >&2
  echo "::error::Could not look up release $RELEASE_TAG"
  exit 1
fi

if [ "$is_draft" = false ]; then
  # Already public: consumers may be installing it, so never replace the asset.
  if ! gh release download "$RELEASE_TAG" --pattern "$asset" --dir "$work/published"; then
    echo "::error::Release $RELEASE_TAG is already published and has no downloadable asset $asset. Refusing to modify a published release."
    exit 1
  fi
  if cmp -s "$tarball" "$work/published/$asset"; then
    echo "Release $RELEASE_TAG is already published with an identical $asset. Nothing to do."
    exit 0
  fi
  echo "::error::Release $RELEASE_TAG is already published and its $asset differs from this build (published sha256 $(sha256sum "$work/published/$asset" | cut -d' ' -f1), built sha256 $(sha256sum "$tarball" | cut -d' ' -f1)). Refusing to replace a published asset; release a new version instead."
  exit 1
fi

if [ "$is_draft" = none ]; then
  create_args=(--verify-tag --generate-notes --draft)
  if [ "$prerelease" = true ]; then
    create_args+=(--prerelease)
  fi
  gh release create "$RELEASE_TAG" "${create_args[@]}"
fi

gh release upload "$RELEASE_TAG" "$tarball" --clobber

# Only the newest stable version is Latest: never a pre-release or a back-port
# tagged after a newer stable release. Publishing a draft marks it Latest unless
# told otherwise.
latest=true
if [ "$prerelease" = true ]; then
  latest=false
else
  highest=$(gh release list --limit 100 --json tagName,isDraft,isPrerelease \
    --jq '.[] | select(.isDraft | not) | select(.isPrerelease | not) | .tagName' |
    grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)
  if [ -n "$highest" ] &&
    [ "$(printf '%s\n%s\n' "$highest" "$RELEASE_TAG" | sort -V | tail -n 1)" != "$RELEASE_TAG" ]; then
    latest=false
  fi
fi

gh release edit "$RELEASE_TAG" --draft=false --prerelease="$prerelease" --latest="$latest"
