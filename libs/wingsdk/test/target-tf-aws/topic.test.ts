import * as cdktf from "cdktf";
import { test, expect } from "vitest";
import * as cloud from "../../src/cloud";
import { Testing } from "../../src/simulator";
import { Duration } from "../../src/std";
import {
  mkdtemp,
  sanitizeCode,
  tfResourcesOf,
  tfResourcesOfCount,
  tfSanitize,
  treeJsonOf,
  createTFAWSApp,
} from "../util";

test("default topic behavior", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  new cloud.Topic(app, "Topic");
  const output = app.synth();

  // THEN
  expect(tfResourcesOf(output)).toEqual(["aws_sns_topic"]);
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("topic with subscriber function", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  const topic = new cloud.Topic(app, "Topic");
  const subscriber = Testing.makeHandler(
    `async handle(event) { console.log("Received: ", event); }`
  );

  topic.onMessage(subscriber);
  const output = app.synth();

  // THEN
  expect(sanitizeCode(subscriber._toInflight())).toMatchSnapshot();
  expect(tfResourcesOf(output)).toEqual([
    "aws_cloudwatch_log_group", // log group for subscriber function
    "aws_iam_role", // role for subscriber function
    "aws_iam_role_policy", // policy for subscriber function role
    "aws_iam_role_policy_attachment", // execution policy for subscriber role
    "aws_lambda_function", // subscriber function
    "aws_lambda_permission", // policy allowing sns to publsh to subscriber lambda
    "aws_s3_bucket", // S3 bucket for code
    "aws_s3_object", // S3 object for code
    "aws_sns_topic", // main topic
    "aws_sns_topic_subscription", // subscriber lambda subscription to topic
  ]);
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("topic with multiple subscribers", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  const topic = new cloud.Topic(app, "Topic");
  const subOne = Testing.makeHandler(
    `async handle(event) { console.log("Got Event: ", event); }`
  );
  const subTwo = Testing.makeHandler(
    `async handle(event) { console.log("Ohh yea!! ", event); }`
  );

  // WHEN
  topic.onMessage(subOne);
  topic.onMessage(subTwo);

  const output = app.synth();

  // THEN
  expect(tfResourcesOfCount(output, "aws_sns_topic")).toEqual(1); // 1 topic
  // 2 everything else
  expect(tfResourcesOfCount(output, "aws_iam_role")).toEqual(2);
  expect(tfResourcesOfCount(output, "aws_iam_role_policy")).toEqual(2);
  expect(tfResourcesOfCount(output, "aws_iam_role_policy_attachment")).toEqual(
    2
  );
  expect(tfResourcesOfCount(output, "aws_lambda_function")).toEqual(2);
  expect(tfResourcesOfCount(output, "aws_lambda_permission")).toEqual(2);
  expect(tfResourcesOfCount(output, "aws_s3_bucket")).toEqual(1);
  expect(tfResourcesOfCount(output, "aws_s3_object")).toEqual(2);
  expect(tfResourcesOfCount(output, "aws_sns_topic_subscription")).toEqual(2);
});

test("topic name valid", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  const topic = new cloud.Topic(app, "The-Spectacular_Topic-01");
  const output = app.synth();

  // THEN
  expect(
    cdktf.Testing.toHaveResourceWithProperties(output, "aws_sns_topic", {
      name: `The-Spectacular_Topic-01-${topic.node.addr.substring(0, 8)}`,
    })
  );
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("replace invalid character from queue name", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  const topic = new cloud.Topic(app, "The%Spectacular@Topic");
  const output = app.synth();

  // THEN
  expect(
    cdktf.Testing.toHaveResourceWithProperties(output, "aws_sns_topic", {
      name: `The-Spectacular-Topic-${topic.node.addr.substring(0, 8)}`,
    })
  );
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("topic with subscriber function timeout", () => {
  // GIVEN
  const app = createTFAWSApp({ outdir: mkdtemp(), entrypointDir: __dirname });
  const topic = new cloud.Topic(app, "Topic");
  const subscriber = Testing.makeHandler(
    `async handle(event) { console.log("Received: ", event); }`
  );

  topic.onMessage(subscriber, { timeout: Duration.fromSeconds(30) });
  const output = app.synth();

  // THEN
  expect(
    cdktf.Testing.toHaveResourceWithProperties(output, "aws_lambda_function", {
      timeout: 30,
    })
  ).toEqual(true);
});
