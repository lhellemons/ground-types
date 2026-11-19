#!/usr/bin/env bash
# Publishes the packed tarball as the GitHub Release for $RELEASE_TAG.
#
# Needs the `gh` CLI with GH_TOKEN and GH_REPO set, gzip, sha256sum
# (coreutils), and `pnpm pack` output in release-artifacts/. A release is
# replaced only while it is a draft:
#
#   no release yet     create a draft, upload the tarball, publish
#   draft              (re)upload the tarball, publish
#   already published  succeed if the published asset has the same contents,
#                      otherwise fail without touching the release
#
# A tag with a hyphen before any `+` (v1.0.0-rc.1) is created and published as
# a pre-release and is never Latest. A plain tag is Latest only when no higher
# stable vX.Y.Z is among the newest 1000 releases that `gh release list`
# returns without drafts and pre-releases; build metadata (`+build.1`) is
# ignored when versions are compared.
#
# A step that fails while the release is absent or a draft leaves it a draft
# (or not created), so a rerun completes it. The already-published path writes
# nothing. A draft must not be published by hand while this script runs: the
# state is read again just before the upload, and a release found published
# then takes the already-published path.
# test/release/publish-release.test.ts drives this script with a stub `gh`.
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG must be set}"

# vMAJOR.MINOR.PATCH, optionally -prerelease and +build identifiers.
version_re='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
# The same without a pre-release part, as a listed stable release is read.
stable_re='^v[0-9]+\.[0-9]+\.[0-9]+(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
if [[ ! $RELEASE_TAG =~ $version_re ]]; then
  echo "::error::RELEASE_TAG '$RELEASE_TAG' is not a version tag (vMAJOR.MINOR.PATCH, optionally -prerelease and +build)"
  exit 1
fi

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

work=$(mktemp -d "${TMPDIR:-/tmp}/publish-release.XXXXXX")
trap 'rm -rf "$work"' EXIT

# Prints the SHA-256 of the expanded gzip stream in $1; gzip's stderr goes to $2.
# Returns 2 when gzip fails, 3 when sha256sum fails or prints no digest.
expanded_digest() {
  local out
  out=$({ gzip -dc "$1" 2>"$2" || : >"$2.failed"; } | sha256sum) || return 3
  [ ! -e "$2.failed" ] || return 2
  out=${out%% *}
  [[ $out =~ ^[0-9a-f]{64}$ ]] || return 3
  printf '%s\n' "$out"
}

# The built tarball's expanded stream is hashed before any gh call, without
# writing it. A gzip failure and a hashing failure are reported apart.
digest_status=0
built_digest=$(expanded_digest "$tarball" "$work/built.err") || digest_status=$?
case "$digest_status" in
  2)
    cat "$work/built.err" >&2
    echo "::error::gzip could not decompress the built $asset (see the gzip output above). Nothing was written to the release. Rebuild the tarball and rerun."
    exit 1
    ;;
  3)
    echo "::error::sha256sum could not hash the built $asset. Nothing was written to the release."
    exit 1
    ;;
esac

# Sets is_draft to true, false or none (no such release). A failed lookup exits
# 1 and is not read as none.
lookup_is_draft() {
  if is_draft=$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft 2>"$work/view.err"); then
    :
  elif grep -q 'release not found' "$work/view.err"; then
    is_draft=none
  else
    cat "$work/view.err" >&2
    echo "::error::Could not look up release $RELEASE_TAG"
    exit 1
  fi
  # Any other value exits 1.
  case "$is_draft" in
    true | false | none) ;;
    *)
      echo "::error::Unexpected isDraft value '$is_draft' for release $RELEASE_TAG"
      exit 1
      ;;
  esac
}

# Compares the built tarball with the asset of the published release, and always
# exits. Nothing is written to the release.
handle_published() {
  if ! gh release download "$RELEASE_TAG" --pattern "$asset" --dir "$work/published" 2>"$work/download.err"; then
    cat "$work/download.err" >&2
    echo "::error::Could not download $asset from the published release $RELEASE_TAG: it has no such asset, or the download failed. Refusing to modify a published release. If the asset is missing, convert the release back to a draft and rerun."
    exit 1
  fi
  published=$work/published/$asset
  # The published asset's expanded stream, gzip trailer included, is hashed
  # without writing it. One that does not decompress cleanly, or cannot be
  # hashed, is reported on its own, not as a difference. Otherwise the tarballs
  # match when byte-identical or when the digests of their expanded streams
  # are equal.
  digest_status=0
  published_digest=$(expanded_digest "$published" "$work/published.err") || digest_status=$?
  case "$digest_status" in
    2)
      cat "$work/published.err" >&2
      echo "::error::Release $RELEASE_TAG is already published, and gzip could not decompress the published $asset (see the gzip output above), so the two cannot be compared. Refusing to modify a published release. Convert the release back to a draft and rerun."
      exit 1
      ;;
    3)
      echo "::error::Release $RELEASE_TAG is already published, and sha256sum could not hash the published $asset, so the two cannot be compared. Refusing to modify a published release."
      exit 1
      ;;
  esac
  if cmp -s "$tarball" "$published"; then
    echo "Release $RELEASE_TAG is already published with an identical $asset. Nothing to do."
    exit 0
  fi
  if [ "$built_digest" = "$published_digest" ]; then
    echo "Release $RELEASE_TAG is already published with the same contents in $asset, compressed differently. Nothing to do."
    exit 0
  fi
  echo "::error::Release $RELEASE_TAG is already published and its $asset differs from this build (published sha256 $(sha256sum "$published" | cut -d' ' -f1), built sha256 $(sha256sum "$tarball" | cut -d' ' -f1)). Refusing to replace a published asset; release a new version instead."
  exit 1
}

lookup_is_draft
if [ "$is_draft" = false ]; then
  handle_published
fi

if [ "$is_draft" = none ]; then
  create_args=(--verify-tag --generate-notes --draft)
  if [ "$prerelease" = true ]; then
    create_args+=(--prerelease)
  fi
  gh release create "$RELEASE_TAG" "${create_args[@]}"
fi

# The state is read again right before the upload; `--clobber` replaces the
# asset.
lookup_is_draft
case "$is_draft" in
  false) handle_published ;;
  none)
    echo "::error::Release $RELEASE_TAG no longer exists. Rerun to start over."
    exit 1
    ;;
esac

gh release upload "$RELEASE_TAG" "$tarball" --clobber

# Only the newest stable version is Latest: never a pre-release or a back-port
# tagged after a newer stable release. Publishing a draft marks it Latest unless
# told otherwise. Each step of the comparison is checked on its own: a failure
# of the list, grep (status above 1), sed, sort or tail leaves the draft.
compare_failed() {
  echo "::error::Could not compare versions to decide Latest. The release stays a draft; rerun to complete it."
  exit 1
}
latest=true
if [ "$prerelease" = true ]; then
  latest=false
else
  tags=$(gh release list --exclude-drafts --exclude-pre-releases --limit 1000 --json tagName --jq '.[].tagName') || {
    echo "::error::Could not list releases to decide Latest. The release stays a draft; rerun to complete it."
    exit 1
  }
  # grep exits 1 when nothing matches, and above 1 when it fails.
  grep_status=0
  stable=$(printf '%s\n' "$tags" | grep -E "$stable_re") || grep_status=$?
  if [ "$grep_status" -gt 1 ]; then
    compare_failed
  fi
  highest=$(printf '%s\n' "$stable" | sed 's/+.*//' | sort -V | tail -n 1) || compare_failed
  if [ -n "$highest" ]; then
    top=$(printf '%s\n%s\n' "$highest" "$core" | sort -V | tail -n 1) || compare_failed
    if [ "$top" != "$core" ]; then
      latest=false
    fi
  fi
fi

gh release edit "$RELEASE_TAG" --draft=false --prerelease="$prerelease" --latest="$latest"
