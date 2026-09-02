import "server-only";

import { parseEnvironment } from "./env.schema";

export const env = parseEnvironment(process.env);
