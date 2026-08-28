#!/bin/bash

rm -r dist

tsc --noEmit

esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --banner:js='import { createRequire as __createRequire } from "node:module";const require = __createRequire(import.meta.url);' \
  --outfile=dist/index.mjs \
  --external:@node-rs/argon2 \
  --external:sharp

mkdir -p dist/node_modules

mkdir -p dist/node_modules/@node-rs
mkdir -p dist/node_modules/@img

cp -r node_modules/@node-rs/argon2 dist/node_modules/@node-rs/argon2
cp -r node_modules/@node-rs/argon2-* dist/node_modules/@node-rs/
cp -r node_modules/sharp dist/node_modules/sharp
cp -r node_modules/@img/* dist/node_modules/@img/

for dep in detect-libc semver color color-convert color-name color-string is-arrayish simple-swizzle; do
  if [ -d "node_modules/$dep" ]; then
    cp -r "node_modules/$dep" "dist/node_modules/$dep"
  fi
done

cd dist
rm lambda.zip 2>/dev/null || true
zip -rq lambda.zip index.mjs node_modules
cd ..
