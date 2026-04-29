"""Generate manifest.json for the auto-update system.

Reads SHA-256 sidecar files written by each platform build job,
then outputs a manifest.json that the UpdateService fetches on launch.

Called by .github/workflows/release.yml in the publish job after
all platform artifacts have been downloaded to ./artifacts/.

Environment variables (set by the workflow):
  TAG   — the git tag, e.g. "v0.2.0"
  REPO  — the GitHub repo slug, e.g. "camchaney/cass_logger_dev"
"""

import json
import os
import sys
from pathlib import Path

TAG = os.environ.get("TAG", "")
REPO = os.environ.get("REPO", "camchaney/cass_logger_dev")

if not TAG:
	print("ERROR: TAG environment variable is not set", file=sys.stderr)
	sys.exit(1)

version = TAG.lstrip("v")
base_url = f"https://github.com/{REPO}/releases/download/{TAG}"

artifacts_dir = Path("artifacts")

platform_files = {
	"darwin-arm64": f"CassLogger-{TAG}-darwin-arm64.dmg",
	"darwin-x86_64": f"CassLogger-{TAG}-darwin-x86_64.dmg",
	"win32-x64": f"CassLogger-{TAG}-win32-x64.exe",
}

platforms = {}
for key, filename in platform_files.items():
	sha_file = artifacts_dir / f"{filename}.sha256"
	if not sha_file.exists():
		print(f"WARNING: SHA-256 file not found for {key}: {sha_file}", file=sys.stderr)
		continue
	sha256 = sha_file.read_text().strip().split()[0]
	platforms[key] = {
		"url": f"{base_url}/{filename}",
		"sha256": sha256,
	}

if not platforms:
	print("ERROR: No platform artifacts found in ./artifacts/", file=sys.stderr)
	sys.exit(1)

manifest = {
	"latest_version": version,
	"minimum_supported_version": version,
	"changelog": f"See release notes: https://github.com/{REPO}/releases/tag/{TAG}",
	"platforms": platforms,
}

Path("manifest.json").write_text(json.dumps(manifest, indent=2))
print(f"Generated manifest.json for {TAG}:")
print(json.dumps(manifest, indent=2))
