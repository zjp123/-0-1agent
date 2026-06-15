import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { openApiDocument } from "../src/api-docs/openapi.document.js";

const outputPath = resolve(
  process.cwd(),
  "../../docs/openapi/enterprise-agent.openapi.json",
);

writeFileSync(outputPath, `${JSON.stringify(openApiDocument, null, 2)}\n`);
