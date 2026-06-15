import { Controller, Get } from "@nestjs/common";

import {
  getApiDocumentationSummary,
  openApiDocument,
  type ApiDocumentationSummary,
} from "./openapi.document.js";

@Controller("docs")
export class ApiDocsController {
  @Get()
  getSummary(): ApiDocumentationSummary {
    return getApiDocumentationSummary();
  }

  @Get("openapi.json")
  getOpenApiDocument(): typeof openApiDocument {
    return openApiDocument;
  }
}
