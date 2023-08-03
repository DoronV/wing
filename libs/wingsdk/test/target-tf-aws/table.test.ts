import { test, expect } from "vitest";
import * as cloud from "../../src/cloud";
import * as ex from "../../src/ex";
import * as tfaws from "../../src/target-tf-aws";
import { Testing } from "../../src/testing";
import {
  mkdtemp,
  sanitizeCode,
  tfResourcesOf,
  tfSanitize,
  treeJsonOf,
} from "../util";

test("default table behavior", () => {
  const app = new tfaws.App({ outdir: mkdtemp() });
  ex.Table._newTable(app, "Table", {
    columns: { name: ex.ColumnType.STRING },
    primaryKey: "id",
    name: "my-wing-table",
  });
  const output = app.synth();

  expect(tfResourcesOf(output)).toEqual(["aws_dynamodb_table"]);
  expect(tfSanitize(output)).toMatchSnapshot();
});

test("function with a table binding", () => {
  const app = new tfaws.App({ outdir: mkdtemp() });
  const table = ex.Table._newTable(app, "Table", {
    columns: { name: ex.ColumnType.STRING },
    primaryKey: "id",
    name: "my-wing-table",
  });
  const inflight = Testing.makeHandler(
    app,
    "Handler",
    `async handle(event) {
  await this.my_table.insert({ id: "test" });
}`,
    {
      my_table: {
        obj: table,
        ops: [ex.TableInflightMethods.INSERT],
      },
    }
  );
  cloud.Function._newFunction(app, "Function", inflight);
  const output = app.synth();

  expect(sanitizeCode(inflight._toInflight())).toMatchSnapshot();
  expect(tfResourcesOf(output)).toEqual([
    "aws_dynamodb_table", // Main table
    "aws_iam_role", // Role for function
    "aws_iam_role_policy", // Policy for role
    "aws_iam_role_policy_attachment", // Execution policy for role
    "aws_lambda_function", // Processor function
    "aws_s3_bucket", // S3 bucket for code
    "aws_s3_object", // S3 object for code
  ]);
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});
