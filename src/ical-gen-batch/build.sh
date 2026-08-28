#!/bin/bash

set -euo pipefail

rm -rf dist
mkdir -p dist

npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --banner:js='import { createRequire as __createRequire } from "node:module";const require = __createRequire(import.meta.url);' \
  --outfile=dist/index.mjs

cd dist
rm -f lambda.zip
zip -rq lambda.zip index.mjs
cd ..
