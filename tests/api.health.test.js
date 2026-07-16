import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/health.js";

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(body) {
      res.body = JSON.parse(body);
    }
  };
  return res;
}

test("health API returns ok status and database connection details", async () => {
  const req = { method: "GET" };
  const res = createMockRes();

  const mockDbData = [{ date: "2026-07-16" }];
  const mockClient = {
    from(table) {
      assert.equal(table, "stock_indicators");
      return {
        select(columns) {
          assert.equal(columns, "date");
          return {
            order(col, opts) {
              assert.equal(col, "date");
              assert.equal(opts.ascending, false);
              return {
                limit(val) {
                  assert.equal(val, 1);
                  return Promise.resolve({
                    data: mockDbData,
                    error: null
                  });
                }
              };
            }
          };
        }
      };
    }
  };

  await handler(req, res, {
    client: mockClient,
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_KEY: "service-role"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.dataDate, "2026-07-16");
});
