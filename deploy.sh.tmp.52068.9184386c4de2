#!/bin/bash
# Menu Hub — build & deploy to Netlify
# Run from the menu-hub directory: bash deploy.sh

set -e
echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Deploying to Netlify..."
npx -y netlify-cli deploy --dir=dist --prod --site=3dc75530-08f2-46df-9655-5346fd6e7663

echo "Done! https://menu-hub-vc.netlify.app"
