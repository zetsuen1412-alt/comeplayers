import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type MigrationEntry = {
  id: string;
  file: string | null;
  dependsOn: string[];
  status: "active" | "documented_gap" | "no_schema_change";
};

type StandaloneEntry = {
  id: string;
  file: string;
  dependsOn: string[];
  status: "unsequenced" | "backfill";
};

type Registry = {
  migrations: MigrationEntry[];
  standaloneSql: StandaloneEntry[];
};

const registryPath = path.join(
  process.cwd(),
  "scripts",
  "migration-registry.json",
);
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Registry;

function readSql(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("migration registry explicitly sequences V3 through V37", () => {
  const ids = registry.migrations.map((entry) => entry.id);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length);

  for (const id of [
    "v3",
    "v4",
    "v5",
    "v6",
    "v7",
    "v8",
    "v9",
    "v10",
    "v11",
    "v12",
    "v13",
    "v14",
    "v14_1",
    "v15",
    "v16",
    "v17",
    "v18",
    "v19",
    "v20",
    "v21",
    "v22",
    "v23",
    "v23_2",
    "v23_3",
    "v23_4",
    "v23_5",
    "v23_6",
    "v23_7",
    "v24",
    "v24_1",
    "v25",
    "v26",
    "v27",
    "v28",
    "v29",
    "v30",
    "v31",
    "v32",
    "v33",
    "v34",
    "v35",
    "v36",
    "v37",
  ]) {
    assert.ok(uniqueIds.has(id), `${id} is missing from registry`);
  }
});

test("migration registry dependencies are explicit and point backward", () => {
  const positions = new Map(
    registry.migrations.map((entry, index) => [entry.id, index]),
  );

  for (const entry of registry.migrations) {
    for (const dependency of entry.dependsOn) {
      assert.ok(
        positions.has(dependency),
        `${entry.id} depends on unknown ${dependency}`,
      );
      assert.ok(
        positions.get(dependency)! < positions.get(entry.id)!,
        `${entry.id} dependency ${dependency} must appear earlier`,
      );
    }
  }
});

test("active migration and standalone SQL files exist", () => {
  for (const entry of registry.migrations) {
    if (entry.status === "active") {
      assert.ok(entry.file, `${entry.id} must declare a file`);
      assert.ok(fs.existsSync(path.join(process.cwd(), entry.file)));
    }
  }

  for (const entry of registry.standaloneSql) {
    assert.ok(fs.existsSync(path.join(process.cwd(), entry.file)), entry.id);
  }
});

test("public migration SQL avoids deprecated broad grants and auth.role policies", () => {
  const files = [
    ...registry.migrations
      .filter((entry) => entry.file)
      .map((entry) => entry.file as string),
    ...registry.standaloneSql.map((entry) => entry.file),
  ];

  for (const file of files) {
    const sql = readSql(file).toLowerCase();
    assert.equal(
      /grant\s+all\s+on\s+schema\s+public\s+to\s+(anon|authenticated|public)/.test(
        sql,
      ),
      false,
      `${file} grants broad schema access`,
    );
    assert.equal(
      /grant\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+(anon|authenticated|public)/.test(
        sql,
      ),
      false,
      `${file} grants broad table access`,
    );
    assert.equal(
      sql.includes("auth.role()"),
      false,
      `${file} uses auth.role()`,
    );
  }
});

test("V22 and V23 finance functions stay service-role only", () => {
  const financeFiles = [
    "scripts/comeplayers_seller_tax_withholding_v22.sql",
    "scripts/comeplayers_finance_governance_v23.sql",
  ];
  const sensitiveFunctions = [
    "cp_apply_seller_tax_v22",
    "complete_order_and_release_escrow_v22",
    "cp_quote_withdrawal_tax_v22",
    "cp_create_withdrawal_request_v22",
    "cp_admin_process_withdrawal_v22",
    "cp_apply_seller_tax_v23",
    "complete_order_and_release_escrow_v23",
    "cp_quote_withdrawal_v23",
    "cp_create_withdrawal_request_v23",
    "cp_admin_process_withdrawal_v23",
  ];

  for (const file of financeFiles) {
    const sql = readSql(file).toLowerCase();
    for (const functionName of sensitiveFunctions) {
      if (!sql.includes(`function public.${functionName}`)) continue;

      assert.match(
        sql,
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}[^;]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`,
        ),
        `${file} must revoke ${functionName} from browser roles`,
      );
      assert.match(
        sql,
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}[^;]*to\\s+service_role`,
        ),
        `${file} must grant ${functionName} only to service_role`,
      );
      assert.equal(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}[^;]*to\\s+(anon|authenticated|public)`,
        ).test(sql),
        false,
        `${file} grants ${functionName} to a browser role`,
      );
    }
  }
});

test("runtime finance routes use V23 settlement contracts instead of legacy V22 RPCs", () => {
  const runtimeFiles = [
    "app/api/checkout/create-order/route.ts",
    "app/api/orders/complete/route.ts",
    "app/api/cron/release-escrow/route.ts",
    "app/api/withdrawals/route.ts",
    "app/api/withdrawals/quote/route.ts",
    "app/api/admin/withdrawals/route.ts",
    "lib/adminOrderActions.ts",
  ];
  const legacyRpcNames = [
    "cp_apply_seller_tax_v22",
    "complete_order_and_release_escrow_v22",
    "cp_quote_withdrawal_tax_v22",
    "cp_create_withdrawal_request_v22",
    "cp_admin_process_withdrawal_v22",
  ];

  for (const file of runtimeFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    for (const legacyRpcName of legacyRpcNames) {
      assert.equal(
        content.includes(legacyRpcName),
        false,
        `${file} still calls ${legacyRpcName}`,
      );
    }
  }
});

test("V15 and V17 schema gaps are intentionally documented", () => {
  const v15 = registry.migrations.find((entry) => entry.id === "v15");
  const v17 = registry.migrations.find((entry) => entry.id === "v17");

  assert.equal(v15?.status, "documented_gap");
  assert.equal(v15?.file, null);
  assert.equal(v17?.status, "no_schema_change");
  assert.equal(v17?.file, null);
});
