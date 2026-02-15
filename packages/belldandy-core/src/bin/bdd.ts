#!/usr/bin/env node
/**
 * Belldandy CLI entry point.
 * Usage: node --import tsx packages/belldandy-core/src/bin/bdd.ts [command] [args]
 */
import { runMain } from "citty";
import { main } from "../cli/main.js";

runMain(main);
