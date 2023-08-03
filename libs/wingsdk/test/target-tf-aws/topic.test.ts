import * as cdktf from "cdktf";
import { test, expect } from "vitest";
import * as cloud from "../../src/cloud";
import { Duration } from "../../src/std";
import * as tfaws from "../../src/target-tf-aws";
import { Testing } from "../../src/testing";
import {
  mkdtemp,
  sanitizeCode,
  tfResourcesOf,
  tfResourcesOfCount,
  tfSanitize,
  treeJsonOf,
} from "../util";

test("default topic behavior", () => {
  // GIVEN
  const app = new tfaws.App({ outdir: mkdtemp() });
  cloud.Topic._newTopic(app, "Topic");
  const output = app.synth();

  // THEN
  expect(tfResourcesOf(output)).toEqual(["aws_sns_topic"]);
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("topic with subscriber function", () => {
  // GIVEN
  const app = new tfaws.App({ outdir: mkdtemp() });
  const topic = cloud.Topic._newTopic(app, "Topic");
  const subscriber = Testing.makeHandler(
    app,
    "Handler",
    `async handle(event) { console.log("Received: ", event); }`
  );

  topic.onMessage(subscriber);
  const output = app.synth();

  // THEN
  expect(sanitizeCode(subscriber._toInflight())).toMatchSnapshot();
  expect(tfResourcesOf(output)).toEqual([
    "aws_iam_role", // Role for subscriber function
    "aws_iam_role_policy", // Policy for subscriber function role
    "aws_iam_role_policy_attachment", // Execution policy for subscriber role
    "aws_lambda_function", // Subscriber function
    "aws_lambda_permission", // Policy allowing sns to publsh to subscriber lambda
    "aws_s3_bucket", // S3 bucket for code
    "aws_s3_object", // S3 object for code
    "aws_sns_topic", // Main topic
    "aws_sns_topic_subscription", // Subscriber lambda subscription to topic
  ]);
  expect(tfSanitize(output)).toMatchSnapshot();
  expect(treeJsonOf(app.outdir)).toMatchSnapshot();
});

test("topic with multiple subscribers", () => {
  // GIVEN
  const app = new tfaws.App({ outdir: mkdtemp() });
  const topic = cloud.Topic._newTopic(app, "Topic");
  const subOne = Testing.makeHandler(
    app,
    "Handler1",
    `async handle(event) { console.log("Got Event: ", event); }`
  );
  const subTwo = Testing.makeHandler(
    app,
    "Handler2",
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
  const app = new tfaws.App({ outdir: mkdtemp() });
  const topic = cloud.Topic._newTopic(app, "The-Spectacular_Topic-01");
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
  const app = new tfaws.App({ outdir: mkdtemp() });
  const topic = cloud.Topic._newTopic(app, "The%Spectacular@Topic");
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
  const app = new tfaws.App({ outdir: mkdtemp() });
  const topic = cloud.Topic._newTopic(app, "Topic");
  const subscriber = Testing.makeHandler(
    app,
    "Handler",
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
