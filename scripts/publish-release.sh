#!/usr/bin/env bash
# Publishes the packed tarball as the GitHub Release for $RELEASE_TAG.
#
# Needs the `gh` CLI with GH_TOKEN and GH_REPO set, and `pnpm pack` output in
# release-artifacts/. A release is replaced only while it is a draft:
#
#   no release yet     create a draft, upload the tarball, publish
#   draft              (re)upload the tarball, publish
#   already published  succeed if the published asset has the same contents,
#                      otherwise fail without touching the release
#
# A tag with a hyphen before any `+` (v1.0.0-rc.1) is created and published as
# a pre-release and is never Latest. A plain tag is Latest only when no higher
# stable vX.Y.Z is published, among the newest 100 releases; build metadata
# (`+build.1`) is ignored when versions are compared.
#
# A step that fails while the release is absent or a draft leaves it a draft
# (or not created), so a rerun completes it. The already-published path writes
# nothing.
# test/release/publish-release.test.ts drives this script with a stub `gh`.
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

# The version without build metadata, which may itself contain a hyphen.
core=${RELEASE_TAG%%+*}
prerelease=false
case "$core" in
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

# Anything else would fall through to replacing the asset.
case "$is_draft" in
  true | false | none) ;;
  *)
    echo "::error::Unexpected isDraft value '$is_draft' for release $RELEASE_TAG"
    exit 1
    ;;
esac

if [ "$is_draft" = false ]; then
  # Already public: consumers may be installing it, so never replace the asset.
  if ! gh release download "$RELEASE_TAG" --pattern "$asset" --dir "$work/published" 2>"$work/download.err"; then
    cat "$work/download.err" >&2
    echo "::error::Could not download $asset from the published release $RELEASE_TAG: it has no such asset, or the download failed. Refusing to modify a published release. If the asset is missing, convert the release back to a draft and rerun."
    exit 1
  fi
  published=$work/published/$asset
  if cmp -s "$tarball" "$published"; then
    echo "Release $RELEASE_TAG is already published with an identical $asset. Nothing to do."
    exit 0
  fi
  # The same contents can compress to different bytes under another zlib. Each
  # side is decompressed to a file so its exit status counts: gzip streams the
  # payload before it reports a bad trailer, so a truncated or corrupt asset
  # would otherwise compare equal.
  if gzip -dc "$tarball" >"$work/built.tar" 2>/dev/null &&
    gzip -dc "$published" >"$work/published.tar" 2>/dev/null &&
    cmp -s "$work/built.tar" "$work/published.tar"; then
    echo "Release $RELEASE_TAG is already published with the same contents in $asset, compressed differently. Nothing to do."
    exit 0
  fi
  echo "::error::Release $RELEASE_TAG is already published and its $asset differs from this build (published sha256 $(sha256sum "$published" | cut -d' ' -f1), built sha256 $(sha256sum "$tarball" | cut -d' ' -f1)). Refusing to replace a published asset; release a new version instead."
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
# told otherwise. The list is fetched on its own line so a failure stops the
# script instead of reading as "no other release".
latest=true
if [ "$prerelease" = true ]; then
  latest=false
else
  tags=$(gh release list --exclude-drafts --exclude-pre-releases --limit 100 --json tagName --jq '.[].tagName') || {
    echo "::error::Could not list releases to decide Latest. The release stays a draft; rerun to complete it."
    exit 1
  }
  highest=$(printf '%s\n' "$tags" | sed 's/+.*//' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1 || true)
  if [ -n "$highest" ] &&
    [ "$(printf '%s\n%s\n' "$highest" "$core" | sort -V | tail -n 1)" != "$core" ]; then
    latest=false
  fi
fi

gh release edit "$RELEASE_TAG" --draft=false --prerelease="$prerelease" --latest="$latest"
