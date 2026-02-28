#!/usr/bin/env node

import { runCommunityWizard } from "../community/wizard.js";

runCommunityWizard().catch((error) => {
  console.error("发生错误:", error);
  process.exit(1);
});
