import test from "node:test";
import assert from "node:assert/strict";

import { getServerConfig } from "../src/server/supabaseAdmin.js";

test("getServerConfig points Vercel operators to Environment Variables when Supabase env is missing", () => {
  assert.throws(
    () => getServerConfig({}),
    /Vercel Project Settings -> Environment Variables/
  );
});
