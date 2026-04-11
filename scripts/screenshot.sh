#!/bin/bash
# Take a screenshot of an HTML file at mobile viewport size.
# Usage: screenshot.sh <html-path> <output-png-path>
#
# Example:
#   bash scripts/screenshot.sh /path/to/mockups/MTB-42/index.html /path/to/mockups/MTB-42/mockup.png

set -e

HTML_PATH="$1"
OUTPUT_PATH="$2"

if [ -z "$HTML_PATH" ] || [ -z "$OUTPUT_PATH" ]; then
  echo "Usage: screenshot.sh <html-path> <output-png-path>" >&2
  exit 1
fi

NODE_PATH=/opt/homebrew/lib/node_modules node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('file://${HTML_PATH}');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '${OUTPUT_PATH}' });
  await browser.close();
  console.log('Screenshot saved: ${OUTPUT_PATH}');
})();
"
