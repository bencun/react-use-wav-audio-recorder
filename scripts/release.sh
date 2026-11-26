#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

package_id="$(node -p "const { name, version } = require('./package.json'); name + '-' + version")"

pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build

release_dir="$(mktemp -d)"
pnpm pack --pack-destination "$release_dir"
tarball="$release_dir/$package_id.tgz"

tar -tf "$tarball"
printf '\nRelease tarball: %s\n' "$tarball"
printf 'Publish with: npm publish %q --access public --tag latest\n' "$tarball"
