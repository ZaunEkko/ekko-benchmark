#!/usr/bin/env node

import { main } from "./cli.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(`Internal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 3;
});
